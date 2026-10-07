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
import { resolveToScannedFile, type ScannedModule } from './tsMorphProject.js';
import { rewriteSpecifierForOutputDirectory } from './utils.js';

// A shorthand `{ user }` renamed to `account` becomes `{ user: account }`,
// keeping its key.
const RENAME_KEEPING_SHORTHAND_KEYS = { usePrefixAndSuffixText: true } as const;

/** The name an anonymous default export is given, so a scanned importer can refer to it. */
const ANONYMOUS_DEFAULT_EXPORT_NAME = 'defaultExport' as const;

/**
 * One name an import declaration binds. `importedName` is `default`, `*` or
 * the exported name. `scannedTargetPath` is the scanned file it points into;
 * otherwise `rewrittenSpecifier` is already rewritten to resolve from the
 * destination.
 */
export type ImportBinding = {
  /** The importing module's path. */
  importerPath: string;
  localName: string;
  importedName: string;
  isTypeOnly: boolean;
  rewrittenSpecifier: string;
  scannedTargetPath: string | undefined;
  /** The identifier a default or namespace import binds, or a named import's specifier. */
  bindingNode: Identifier | ImportSpecifier;
};

/** A top-level name a module declares. */
export type DeclaredName = {
  declarationName: string;
  /** Exported under its own name, so renaming it would change the module's exports. */
  isExportedUnderOwnName: boolean;
  nameIdentifier: Identifier;
};

export type ModuleContext = {
  scannedModule: ScannedModule;
  importBindings: ImportBinding[];
  /** Specifiers from outside the set, imported for their side effect only. */
  sideEffectImportSpecifiers: string[];
  /** Exported name → the local name it exports, for an `export { … }` with no module specifier and `export default <name>`. */
  localNameByExportedName: Map<string, string>;
  /** Exported name → the declaration's own name, for a declaration carrying `export`. */
  declarationNameByExportedName: Map<string, string>;
  declaredNames: DeclaredName[];
};

/** The name a specifier binds or exports under: its alias, or its own name without one. */
export const getAliasOrOwnName = (specifier: ImportSpecifier | ExportSpecifier): string => {
  return specifier.getAliasNode()?.getText() ?? specifier.getName();
};

/** Whether `statement` declares a name rather than running anything, its initializers aside. */
export const isDeclarationStatement = (topLevelStatement: Statement): boolean => {
  return (
    Node.isVariableStatement(topLevelStatement) ||
    Node.isFunctionDeclaration(topLevelStatement) ||
    Node.isClassDeclaration(topLevelStatement) ||
    Node.isInterfaceDeclaration(topLevelStatement) ||
    Node.isTypeAliasDeclaration(topLevelStatement) ||
    Node.isEnumDeclaration(topLevelStatement) ||
    Node.isModuleDeclaration(topLevelStatement) ||
    Node.isImportEqualsDeclaration(topLevelStatement)
  );
};

const getTopLevelNameIdentifiers = (topLevelStatement: Statement): Identifier[] => {
  if (Node.isVariableStatement(topLevelStatement)) {
    return topLevelStatement.getDeclarations().flatMap((declaration) => {
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
    Node.isFunctionDeclaration(topLevelStatement) ||
    Node.isClassDeclaration(topLevelStatement) ||
    Node.isInterfaceDeclaration(topLevelStatement) ||
    Node.isTypeAliasDeclaration(topLevelStatement) ||
    Node.isEnumDeclaration(topLevelStatement) ||
    Node.isModuleDeclaration(topLevelStatement) ||
    Node.isImportEqualsDeclaration(topLevelStatement)
  ) {
    const nameNode = topLevelStatement.getNameNode();
    return nameNode !== undefined && Node.isIdentifier(nameNode) ? [nameNode] : [];
  }
  return [];
};

// Whether `identifier` names something declared inside a function, block or
// class of its module, rather than at the top level.
const isNestedDeclarationName = (identifier: Identifier): boolean => {
  const parent = identifier.getParent();
  const isDeclarationName =
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
  const topLevelStatement = identifier.getFirstAncestor((ancestor) =>
    Node.isSourceFile(ancestor.getParent()),
  );
  const isTopLevelName =
    topLevelStatement !== undefined &&
    Node.isStatement(topLevelStatement) &&
    getTopLevelNameIdentifiers(topLevelStatement).includes(identifier);
  return isDeclarationName && !isTopLevelName;
};

// Renames every inner declaration of `name` in `sourceFile`, so a top-level
// binding about to take that name can't be shadowed by it.
const renameNestedDeclarationsOf = (sourceFile: SourceFile, name: string): void => {
  const usedIdentifierTexts = new Set(
    sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .map((identifier) => identifier.getText()),
  );
  const shadowingIdentifiers = sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => identifier.getText() === name && isNestedDeclarationName(identifier));
  for (const identifier of shadowingIdentifiers) {
    let suffix = 2;
    while (usedIdentifierTexts.has(`${name}_${String(suffix)}`)) {
      suffix += 1;
    }
    usedIdentifierTexts.add(`${name}_${String(suffix)}`);
    identifier.rename(`${name}_${String(suffix)}`, RENAME_KEEPING_SHORTHAND_KEYS);
  }
};

/** Renames `identifier` and every reference to it, first renaming any inner declaration that would capture it under `name`. */
export const renameAvoidingShadowing = (identifier: Identifier, name: string): void => {
  renameNestedDeclarationsOf(identifier.getSourceFile(), name);
  identifier.rename(name, RENAME_KEEPING_SHORTHAND_KEYS);
};

/** Renames an import's local binding and every reference to it in its module. */
export const renameImportBinding = (binding: ImportBinding, name: string): void => {
  const { bindingNode } = binding;
  if (Node.isIdentifier(bindingNode)) {
    renameAvoidingShadowing(bindingNode, name);
    return;
  }
  if (bindingNode.getAliasNode() === undefined) {
    bindingNode.setAlias(bindingNode.getName());
  }
  const aliasIdentifier = bindingNode.getAliasNode();
  if (aliasIdentifier !== undefined) {
    renameAvoidingShadowing(aliasIdentifier, name);
  }
};

// Gives an anonymous default export a name, so an import of it can collapse
// into a reference: `export default <expression>` becomes a `const`, and a
// nameless default function or class is named.
const nameAnonymousDefaultExport = (sourceFile: SourceFile): void => {
  for (const topLevelStatement of sourceFile.getStatements()) {
    if (Node.isExportAssignment(topLevelStatement)) {
      const expression = topLevelStatement.getExpression();
      if (!topLevelStatement.isExportEquals() && !Node.isIdentifier(expression)) {
        topLevelStatement.replaceWithText(
          `const ${ANONYMOUS_DEFAULT_EXPORT_NAME} = ${expression.getText()};\nexport default ${ANONYMOUS_DEFAULT_EXPORT_NAME};`,
        );
      }
    } else if (
      (Node.isFunctionDeclaration(topLevelStatement) ||
        Node.isClassDeclaration(topLevelStatement)) &&
      topLevelStatement.isDefaultExport() &&
      topLevelStatement.getNameNode() === undefined
    ) {
      topLevelStatement.rename(ANONYMOUS_DEFAULT_EXPORT_NAME);
    }
  }
};

type ReadImportBindingsArgs = {
  importerPath: string;
  importDeclaration: ImportDeclaration;
  scannedFilePaths: ReadonlySet<string>;
  outputDirectory: string;
};

// Every name one import declaration binds.
const readImportBindings = ({
  importerPath,
  importDeclaration,
  scannedFilePaths,
  outputDirectory,
}: ReadImportBindingsArgs): ImportBinding[] => {
  const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
  const fieldsSharedByEveryBinding = {
    importerPath,
    rewrittenSpecifier: rewriteSpecifierForOutputDirectory(
      moduleSpecifier,
      importerPath,
      outputDirectory,
    ),
    scannedTargetPath: resolveToScannedFile(moduleSpecifier, importerPath, scannedFilePaths),
  };
  const isDeclarationTypeOnly = importDeclaration.isTypeOnly();
  const defaultImport = importDeclaration.getDefaultImport();
  const namespaceImport = importDeclaration.getNamespaceImport();
  return [
    ...(defaultImport === undefined
      ? []
      : [
          {
            ...fieldsSharedByEveryBinding,
            localName: defaultImport.getText(),
            importedName: 'default',
            isTypeOnly: isDeclarationTypeOnly,
            bindingNode: defaultImport,
          },
        ]),
    // Into the set, a namespace import is NAMESPACE_IMPORT_OF_SCANNED_FILE
    // before this runs; from outside, it is an ordinary import.
    ...(namespaceImport === undefined
      ? []
      : [
          {
            ...fieldsSharedByEveryBinding,
            scannedTargetPath: undefined,
            localName: namespaceImport.getText(),
            importedName: '*',
            isTypeOnly: isDeclarationTypeOnly,
            bindingNode: namespaceImport,
          },
        ]),
    ...importDeclaration.getNamedImports().map((importSpecifier) => ({
      ...fieldsSharedByEveryBinding,
      localName: getAliasOrOwnName(importSpecifier),
      importedName: importSpecifier.getName(),
      isTypeOnly: isDeclarationTypeOnly || importSpecifier.isTypeOnly(),
      bindingNode: importSpecifier,
    })),
  ];
};

// A side-effect-only import (`import './setup.js'`) binds nothing.
const isSideEffectOnlyImport = (importDeclaration: ImportDeclaration): boolean => {
  return (
    importDeclaration.getDefaultImport() === undefined &&
    importDeclaration.getNamespaceImport() === undefined &&
    importDeclaration.getNamedImports().length === 0
  );
};

// Exported name → the local name it exports, for an `export { … }` with no
// module specifier and `export default <name>`.
const readLocalNameByExportedName = (sourceFile: SourceFile): Map<string, string> => {
  const localNameByExportedName = new Map<string, string>();
  for (const exportDeclaration of sourceFile.getExportDeclarations()) {
    if (exportDeclaration.getModuleSpecifierValue() === undefined) {
      for (const exportSpecifier of exportDeclaration.getNamedExports()) {
        localNameByExportedName.set(getAliasOrOwnName(exportSpecifier), exportSpecifier.getName());
      }
    }
  }
  for (const exportAssignment of sourceFile.getExportAssignments()) {
    const exportedExpression = exportAssignment.getExpression();
    if (!exportAssignment.isExportEquals() && Node.isIdentifier(exportedExpression)) {
      localNameByExportedName.set('default', exportedExpression.getText());
    }
  }
  return localNameByExportedName;
};

// Every top-level name the module declares, and the exported ones by the
// name they are exported under.
const readDeclaredNames = (
  sourceFile: SourceFile,
  localNameByExportedName: ReadonlyMap<string, string>,
): Pick<ModuleContext, 'declaredNames' | 'declarationNameByExportedName'> => {
  const declarationNameByExportedName = new Map<string, string>();
  const declaredNames: DeclaredName[] = [];
  for (const topLevelStatement of sourceFile.getStatements()) {
    const hasExportKeyword =
      Node.isExportable(topLevelStatement) && topLevelStatement.hasExportKeyword();
    const isDefaultExport = hasExportKeyword && topLevelStatement.hasDefaultKeyword();
    for (const nameIdentifier of getTopLevelNameIdentifiers(topLevelStatement)) {
      const declarationName = nameIdentifier.getText();
      if (hasExportKeyword) {
        declarationNameByExportedName.set(
          isDefaultExport ? 'default' : declarationName,
          declarationName,
        );
      }
      declaredNames.push({
        declarationName,
        isExportedUnderOwnName:
          (hasExportKeyword && !isDefaultExport) ||
          localNameByExportedName.get(declarationName) === declarationName,
        nameIdentifier,
      });
    }
  }
  return { declaredNames, declarationNameByExportedName };
};

export type ReadModuleContextArgs = {
  scannedModule: ScannedModule;
  scannedFilePaths: ReadonlySet<string>;
  outputDirectory: string;
};

export const readModuleContext = ({
  scannedModule,
  scannedFilePaths,
  outputDirectory,
}: ReadModuleContextArgs): ModuleContext => {
  const { path, sourceFile } = scannedModule;
  nameAnonymousDefaultExport(sourceFile);
  const importDeclarations = sourceFile.getImportDeclarations();
  const importBindings = importDeclarations
    .filter((importDeclaration) => !isSideEffectOnlyImport(importDeclaration))
    .flatMap((importDeclaration) =>
      readImportBindings({
        importerPath: path,
        importDeclaration,
        scannedFilePaths,
        outputDirectory,
      }),
    );
  const sideEffectImportSpecifiers = importDeclarations
    .filter(isSideEffectOnlyImport)
    .map((importDeclaration) => importDeclaration.getModuleSpecifierValue())
    .filter(
      (moduleSpecifier) =>
        resolveToScannedFile(moduleSpecifier, path, scannedFilePaths) === undefined,
    )
    .map((moduleSpecifier) =>
      rewriteSpecifierForOutputDirectory(moduleSpecifier, path, outputDirectory),
    );
  const localNameByExportedName = readLocalNameByExportedName(sourceFile);
  return {
    scannedModule,
    importBindings,
    sideEffectImportSpecifiers,
    localNameByExportedName,
    ...readDeclaredNames(sourceFile, localNameByExportedName),
  };
};
