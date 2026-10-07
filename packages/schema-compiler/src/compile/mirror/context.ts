// What one scanned module binds at its top level: the names it imports, the
// names it declares itself, and the local name behind each of its exports.
import {
  Node,
  SyntaxKind,
  type ExportSpecifier,
  type Identifier,
  type ImportDeclaration,
  type ImportSpecifier,
  type SourceFile,
  type Statement,
} from 'ts-morph';
import { resolveScanned, type ScannedModule } from './tsMorphProject.js';
import { rewriteSpecifier } from './utils.js';

// A shorthand `{ user }` renamed to `account` becomes `{ user: account }`,
// keeping its key.
const RENAME_OPTIONS = { usePrefixAndSuffixText: true } as const;

/** The name an anonymous default export is given, so a scanned importer can refer to it. */
const DEFAULT_EXPORT_NAME = 'defaultExport' as const;

/**
 * One name an import declaration binds. `imported` is `default`, `*` or the
 * exported name. `target` is the scanned file it points into; otherwise
 * `specifier` is already rewritten to resolve from the destination.
 */
export type ImportBinding = {
  /** The importing module's path. */
  importer: string;
  local: string;
  imported: string;
  typeOnly: boolean;
  specifier: string;
  target: string | undefined;
  /** The identifier a default or namespace import binds, or a named import's specifier. */
  node: Identifier | ImportSpecifier;
};

/** A top-level name a module declares. */
export type Declared = {
  name: string;
  /** Exported under its own name, so renaming it would change the module's exports. */
  exportedAsItself: boolean;
  identifier: Identifier;
};

export type ModuleContext = {
  module: ScannedModule;
  imports: ImportBinding[];
  /** Specifiers from outside the set, imported for their side effect only. */
  bareImports: string[];
  /** Exported name → the local name it exports, for an `export { … }` with no module specifier and `export default <name>`. */
  localExports: Map<string, string>;
  /** Exported name → the declaration's own name, for a declaration carrying `export`. */
  declaredExports: Map<string, string>;
  declared: Declared[];
};

/** The name a specifier binds or exports under: its alias, or its own name without one. */
export const aliasOrName = (specifier: ImportSpecifier | ExportSpecifier): string => {
  return specifier.getAliasNode()?.getText() ?? specifier.getName();
};

/** Whether `statement` declares a name rather than running anything, its initializers aside. */
export const isDeclaration = (statement: Statement): boolean => {
  return (
    Node.isVariableStatement(statement) ||
    Node.isFunctionDeclaration(statement) ||
    Node.isClassDeclaration(statement) ||
    Node.isInterfaceDeclaration(statement) ||
    Node.isTypeAliasDeclaration(statement) ||
    Node.isEnumDeclaration(statement) ||
    Node.isModuleDeclaration(statement) ||
    Node.isImportEqualsDeclaration(statement)
  );
};

const bindingIdentifiers = (statement: Statement): Identifier[] => {
  if (Node.isVariableStatement(statement)) {
    return statement.getDeclarations().flatMap((declaration) => {
      const nameNode = declaration.getNameNode();
      return Node.isIdentifier(nameNode)
        ? [nameNode]
        : nameNode.getDescendantsOfKind(SyntaxKind.Identifier).filter((identifier) => {
            const parent = identifier.getParent();
            return Node.isBindingElement(parent) && parent.getNameNode() === identifier;
          });
    });
  }
  if (
    Node.isFunctionDeclaration(statement) ||
    Node.isClassDeclaration(statement) ||
    Node.isInterfaceDeclaration(statement) ||
    Node.isTypeAliasDeclaration(statement) ||
    Node.isEnumDeclaration(statement) ||
    Node.isModuleDeclaration(statement) ||
    Node.isImportEqualsDeclaration(statement)
  ) {
    const nameNode = statement.getNameNode();
    return nameNode !== undefined && Node.isIdentifier(nameNode) ? [nameNode] : [];
  }
  return [];
};

// Whether `identifier` names something declared inside a function, block or
// class of its module, rather than at the top level.
const isInnerDeclarationName = (identifier: Identifier): boolean => {
  const parent = identifier.getParent();
  const declares =
    (Node.isVariableDeclaration(parent) ||
      Node.isParameterDeclaration(parent) ||
      Node.isBindingElement(parent) ||
      Node.isFunctionDeclaration(parent) ||
      Node.isFunctionExpression(parent) ||
      Node.isClassDeclaration(parent) ||
      Node.isClassExpression(parent) ||
      Node.isTypeParameterDeclaration(parent) ||
      Node.isEnumDeclaration(parent) ||
      Node.isInterfaceDeclaration(parent) ||
      Node.isTypeAliasDeclaration(parent)) &&
    parent.getNameNode() === identifier;
  const statement = identifier.getFirstAncestor((ancestor) =>
    Node.isSourceFile(ancestor.getParent()),
  );
  const topLevel =
    statement !== undefined &&
    Node.isStatement(statement) &&
    bindingIdentifiers(statement).includes(identifier);
  return declares && !topLevel;
};

// Renames every inner declaration of `name` in `sourceFile`, so a top-level
// binding about to take that name can't be shadowed by it.
const freeName = (sourceFile: SourceFile, name: string): void => {
  const used = new Set(
    sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .map((identifier) => identifier.getText()),
  );
  const shadowing = sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => identifier.getText() === name && isInnerDeclarationName(identifier));
  for (const identifier of shadowing) {
    let suffix = 2;
    while (used.has(`${name}_${String(suffix)}`)) {
      suffix += 1;
    }
    used.add(`${name}_${String(suffix)}`);
    identifier.rename(`${name}_${String(suffix)}`, RENAME_OPTIONS);
  }
};

/** Renames `identifier` and every reference to it, first renaming any inner declaration that would capture it under `name`. */
export const renameIdentifier = (identifier: Identifier, name: string): void => {
  freeName(identifier.getSourceFile(), name);
  identifier.rename(name, RENAME_OPTIONS);
};

/** Renames an import's local binding and every reference to it in its module. */
export const renameImport = (binding: ImportBinding, name: string): void => {
  const { node } = binding;
  if (Node.isIdentifier(node)) {
    renameIdentifier(node, name);
    return;
  }
  if (node.getAliasNode() === undefined) {
    node.setAlias(node.getName());
  }
  const alias = node.getAliasNode();
  if (alias !== undefined) {
    renameIdentifier(alias, name);
  }
};

// Gives an anonymous default export a name, so an import of it can collapse
// into a reference: `export default <expression>` becomes a `const`, and a
// nameless default function or class is named.
const nameAnonymousDefault = (sourceFile: SourceFile): void => {
  for (const statement of sourceFile.getStatements()) {
    if (Node.isExportAssignment(statement)) {
      const expression = statement.getExpression();
      if (!statement.isExportEquals() && !Node.isIdentifier(expression)) {
        statement.replaceWithText(
          `const ${DEFAULT_EXPORT_NAME} = ${expression.getText()};\nexport default ${DEFAULT_EXPORT_NAME};`,
        );
      }
    } else if (
      (Node.isFunctionDeclaration(statement) || Node.isClassDeclaration(statement)) &&
      statement.isDefaultExport() &&
      statement.getNameNode() === undefined
    ) {
      statement.rename(DEFAULT_EXPORT_NAME);
    }
  }
};

type ReadImportBindingsArgs = {
  path: string;
  declaration: ImportDeclaration;
  scanned: ReadonlySet<string>;
  outputDirectory: string;
};

// Every name one import declaration binds.
const readImportBindings = ({
  path,
  declaration,
  scanned,
  outputDirectory,
}: ReadImportBindingsArgs): ImportBinding[] => {
  const raw = declaration.getModuleSpecifierValue();
  const common = {
    importer: path,
    specifier: rewriteSpecifier(raw, path, outputDirectory),
    target: resolveScanned(raw, path, scanned),
  };
  const typeOnly = declaration.isTypeOnly();
  const defaultImport = declaration.getDefaultImport();
  const namespaceImport = declaration.getNamespaceImport();
  return [
    ...(defaultImport === undefined
      ? []
      : [
          {
            ...common,
            local: defaultImport.getText(),
            imported: 'default',
            typeOnly,
            node: defaultImport,
          },
        ]),
    // Into the set, a namespace import is NAMESPACE_IMPORT_OF_SCANNED_FILE
    // before this runs; from outside, it is an ordinary import.
    ...(namespaceImport === undefined
      ? []
      : [
          {
            ...common,
            target: undefined,
            local: namespaceImport.getText(),
            imported: '*',
            typeOnly,
            node: namespaceImport,
          },
        ]),
    ...declaration.getNamedImports().map((specifierNode) => ({
      ...common,
      local: aliasOrName(specifierNode),
      imported: specifierNode.getName(),
      typeOnly: typeOnly || specifierNode.isTypeOnly(),
      node: specifierNode,
    })),
  ];
};

// A side-effect-only import (`import './setup.js'`) binds nothing.
const isBareImport = (declaration: ImportDeclaration): boolean => {
  return (
    declaration.getDefaultImport() === undefined &&
    declaration.getNamespaceImport() === undefined &&
    declaration.getNamedImports().length === 0
  );
};

// Exported name → the local name it exports, for an `export { … }` with no
// module specifier and `export default <name>`.
const readLocalExports = (sourceFile: SourceFile): Map<string, string> => {
  const localExports = new Map<string, string>();
  for (const declaration of sourceFile.getExportDeclarations()) {
    if (declaration.getModuleSpecifierValue() === undefined) {
      for (const specifierNode of declaration.getNamedExports()) {
        localExports.set(aliasOrName(specifierNode), specifierNode.getName());
      }
    }
  }
  for (const assignment of sourceFile.getExportAssignments()) {
    const expression = assignment.getExpression();
    if (!assignment.isExportEquals() && Node.isIdentifier(expression)) {
      localExports.set('default', expression.getText());
    }
  }
  return localExports;
};

// Every top-level name the module declares, and the exported ones by the
// name they are exported under.
const readDeclarations = (
  sourceFile: SourceFile,
  localExports: ReadonlyMap<string, string>,
): Pick<ModuleContext, 'declared' | 'declaredExports'> => {
  const declaredExports = new Map<string, string>();
  const declared: Declared[] = [];
  for (const statement of sourceFile.getStatements()) {
    const exportable = Node.isExportable(statement) && statement.hasExportKeyword();
    const isDefault = exportable && statement.hasDefaultKeyword();
    for (const identifier of bindingIdentifiers(statement)) {
      const name = identifier.getText();
      if (exportable) {
        declaredExports.set(isDefault ? 'default' : name, name);
      }
      declared.push({
        name,
        exportedAsItself: (exportable && !isDefault) || localExports.get(name) === name,
        identifier,
      });
    }
  }
  return { declared, declaredExports };
};

export type ReadContextArgs = {
  module: ScannedModule;
  scanned: ReadonlySet<string>;
  outputDirectory: string;
};

export const readContext = ({
  module,
  scanned,
  outputDirectory,
}: ReadContextArgs): ModuleContext => {
  const { path, sourceFile } = module;
  nameAnonymousDefault(sourceFile);
  const declarations = sourceFile.getImportDeclarations();
  const imports = declarations
    .filter((declaration) => !isBareImport(declaration))
    .flatMap((declaration) => readImportBindings({ path, declaration, scanned, outputDirectory }));
  const bareImports = declarations
    .filter(isBareImport)
    .map((declaration) => declaration.getModuleSpecifierValue())
    .filter((raw) => resolveScanned(raw, path, scanned) === undefined)
    .map((raw) => rewriteSpecifier(raw, path, outputDirectory));
  const localExports = readLocalExports(sourceFile);
  return {
    module,
    imports,
    bareImports,
    localExports,
    ...readDeclarations(sourceFile, localExports),
  };
};
