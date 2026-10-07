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

/**
 * The name an import or export specifier makes available: its alias when it
 * has one, otherwise the name itself.
 *
 * ```ts
 * import { user } from './user.js';            // 'user'
 * import { user as account } from './user.js'; // 'account'
 * export { user as account };                  // 'account'
 * ```
 */
export const getAliasOrOwnName = (specifier: ImportSpecifier | ExportSpecifier): string => {
  return specifier.getAliasNode()?.getText() ?? specifier.getName();
};

/**
 * Whether a top-level statement only declares names, so evaluating it runs
 * nothing but its initializers.
 *
 * ```ts
 * const user = pvl.object({ … });   // true
 * function format() { … }           // true
 * class Registry { … }              // true
 * type User = Infer<typeof user>;   // true
 * import fs = require('node:fs');   // true
 * console.log('loaded');            // false: a call
 * if (debug) { … }                  // false
 * ```
 */
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

// The identifiers of the names a top-level statement declares at module
// scope, the ones the Destination File's single scope must keep unique.
//
//   const user = …, post = …;          // [user, post]
//   const { id, meta: { tags } } = …;  // [id, tags]: `meta` is a key, not a name
//   function format() { … }            // [format]
//   export default function () { … }  // []: no name yet
//   console.log('loaded');             // []
const getTopLevelNameIdentifiers = (topLevelStatement: Statement): Identifier[] => {
  if (Node.isVariableStatement(topLevelStatement)) {
    return topLevelStatement.getDeclarations().flatMap((variableDeclaration) => {
      const declaredNameNode = variableDeclaration.getNameNode();
      return Node.isIdentifier(declaredNameNode)
        ? [declaredNameNode]
        : declaredNameNode
            .getDescendantsOfKind(SyntaxKind.Identifier)
            .filter((patternIdentifier) => {
              const bindingElement = patternIdentifier.getParent();
              return (
                Node.isBindingElement(bindingElement) &&
                bindingElement.getNameNode() === patternIdentifier
              );
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
    const declaredNameNode = topLevelStatement.getNameNode();
    return declaredNameNode !== undefined && Node.isIdentifier(declaredNameNode)
      ? [declaredNameNode]
      : [];
  }
  return [];
};

// Whether `identifier` is the name in a declaration nested inside a
// function, block or class, rather than a top-level one or a reference.
//
//   const user = …;                         // `user`: top level, false
//   const build = (user) => {               // parameter `user`: true
//     const post = …;                       // `post`: true
//     return user;                          // a reference: false
//   };
const isNestedDeclarationName = (identifier: Identifier): boolean => {
  const declaringNode = identifier.getParent();
  const isDeclarationName =
    (Node.isVariableDeclaration(declaringNode) ||
      Node.isParameterDeclaration(declaringNode) ||
      Node.isBindingElement(declaringNode) ||
      Node.isFunctionDeclaration(declaringNode) ||
      Node.isFunctionExpression(declaringNode) ||
      Node.isClassDeclaration(declaringNode) ||
      Node.isClassExpression(declaringNode) ||
      Node.isTypeParameterDeclaration(declaringNode) ||
      Node.isEnumDeclaration(declaringNode) ||
      Node.isInterfaceDeclaration(declaringNode) ||
      Node.isTypeAliasDeclaration(declaringNode)) &&
    declaringNode.getNameNode() === identifier;
  const topLevelStatement = identifier.getFirstAncestor((ancestor) =>
    Node.isSourceFile(ancestor.getParent()),
  );
  const isTopLevelName =
    topLevelStatement !== undefined &&
    Node.isStatement(topLevelStatement) &&
    getTopLevelNameIdentifiers(topLevelStatement).includes(identifier);
  return isDeclarationName && !isTopLevelName;
};

// Renames every nested declaration of `name` in `sourceFile` to the first
// unused `<name>_<n>`, so a top-level binding about to be renamed to `name`
// isn't shadowed inside it. Before renaming the import `account` to `user`:
//
//   import { user as account } from './user.js';
//   const greet = (user) => `${user.name} of ${account.id}`;
//
// the parameter becomes `user_2`, otherwise `account.id` would turn into
// `user.id` and read the parameter:
//
//   const greet = (user_2) => `${user_2.name} of ${user.id}`;
const renameNestedDeclarationsOf = (sourceFile: SourceFile, name: string): void => {
  const usedIdentifierTexts = new Set(
    sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .map((identifier) => identifier.getText()),
  );
  const shadowingIdentifiers = sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((identifier) => identifier.getText() === name && isNestedDeclarationName(identifier));
  for (const shadowingIdentifier of shadowingIdentifiers) {
    let suffix = 2;
    while (usedIdentifierTexts.has(`${name}_${String(suffix)}`)) {
      suffix += 1;
    }
    usedIdentifierTexts.add(`${name}_${String(suffix)}`);
    shadowingIdentifier.rename(`${name}_${String(suffix)}`, RENAME_KEEPING_SHORTHAND_KEYS);
  }
};

/**
 * Renames the declaration `identifier` to `name` along with every
 * reference to it, after moving any nested declaration of `name` out of the
 * way (see `renameNestedDeclarationsOf`). A shorthand property keeps its key:
 *
 * ```ts
 * const user = …; export const payload = { user };
 * // renamed to user_2:
 * const user_2 = …; export const payload = { user: user_2 };
 * ```
 */
export const renameAvoidingShadowing = (identifier: Identifier, name: string): void => {
  renameNestedDeclarationsOf(identifier.getSourceFile(), name);
  identifier.rename(name, RENAME_KEEPING_SHORTHAND_KEYS);
};

/**
 * Renames the local name an import binds to `name`, and every reference to
 * it in the importing module. A named import gains an alias, so it still
 * imports the same export:
 *
 * ```ts
 * import { user } from './user.js';          // → import { user as user_2 } …
 * import { user as account } from './user.js'; // → import { user as user_2 } …
 * import config from './config.js';          // → import config_2 from …
 * ```
 */
export const renameImportBinding = (importBinding: ImportBinding, name: string): void => {
  const { bindingNode } = importBinding;
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

// Gives a module's anonymous default export the name `defaultExport`, so a
// scanned module importing it has a binding to refer to.
//
//   export default pvl.string();       // → const defaultExport = pvl.string();
//                                      //   export default defaultExport;
//   export default function () { … }   // → export default function defaultExport() { … }
//   export default class { … }         // → export default class defaultExport { … }
//
// A default export that is already a name is left alone:
//
//   export default user;
//   export default function format() { … }
const nameAnonymousDefaultExport = (sourceFile: SourceFile): void => {
  for (const topLevelStatement of sourceFile.getStatements()) {
    if (Node.isExportAssignment(topLevelStatement)) {
      const exportedExpression = topLevelStatement.getExpression();
      if (!topLevelStatement.isExportEquals() && !Node.isIdentifier(exportedExpression)) {
        topLevelStatement.replaceWithText(
          `const ${ANONYMOUS_DEFAULT_EXPORT_NAME} = ${exportedExpression.getText()};\nexport default ${ANONYMOUS_DEFAULT_EXPORT_NAME};`,
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

// One ImportBinding per name an import declaration binds.
//
//   import config, { user as account, type Post } from './models.js';
//
//   → { localName: 'config',  importedName: 'default', isTypeOnly: false }
//     { localName: 'account', importedName: 'user',    isTypeOnly: false }
//     { localName: 'Post',    importedName: 'Post',    isTypeOnly: true }
//
// each carrying the specifier rewritten for the output directory, and
// `scannedTargetPath` when `./models.js` is a scanned file.
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

// Whether an import declaration only runs its module and binds no name.
//
//   import './setup.js';                  // true
//   import 'reflect-metadata';            // true
//   import { user } from './user.js';     // false
//   import {} from './user.js';           // true: binds nothing
const isSideEffectOnlyImport = (importDeclaration: ImportDeclaration): boolean => {
  return (
    importDeclaration.getDefaultImport() === undefined &&
    importDeclaration.getNamespaceImport() === undefined &&
    importDeclaration.getNamedImports().length === 0
  );
};

// For the exports that name a binding declared elsewhere in the same
// module, the local name behind each exported name.
//
//   export { user, post as article };  // user → user, article → post
//   export default user;               // default → user
//
// A declaration carrying `export` is read by `readDeclaredNames`, and
// `export { … } from './other.js'` names another module's binding, so
// neither is here.
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

// Every top-level name the module declares, and for each declaration
// carrying `export`, the name it is exported under.
//
//   export const user = …;               // exported as `user`, under its own name
//   export default function format() {}  // exported as `default`, not under its own name
//   const post = …; export { post };     // exported under its own name, via `export { … }`
//   const draft = …;                     // not exported: may be renamed freely
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

/**
 * Reads everything one scanned module binds at its top level, which the
 * later steps resolve and rename: its imports, its side-effect-only imports
 * of files outside the set, its own declarations and how each export maps
 * to a local name. First gives an anonymous default export the name
 * `defaultExport`.
 *
 * ```ts
 * import { pvl } from '@pvl/schema';
 * import './setup.js';
 * const base = pvl.object({ … });
 * export const user = base.extend({ … });
 * export default user;
 * ```
 *
 * gives one import binding (`pvl`), one side-effect import (`./setup.js`
 * rewritten, unless setup.ts is scanned), the declared names `base` and
 * `user`, and the exports `user` → `user` and `default` → `user`.
 */
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
