// What one scanned module binds at its top level: the names it imports, the
// names it declares itself, and the local name behind each of its exports.
//
// Three kinds of specifier, named apart everywhere in the mirror:
//
//   import { user as account } from './user.js';
//            ^^^^^^^^^^^^^^^        ^^^^^^^^^^^ module specifier: the module an import or re-export names
//            import specifier: one name in an import's braces
//
//   export { user as account } from './user.js';
//            ^^^^^^^^^^^^^^^ export specifier: one name in an export's braces
import {
  Node,
  SyntaxKind,
  type ClassDeclaration,
  type EnumDeclaration,
  type ExportSpecifier,
  type FunctionDeclaration,
  type Identifier,
  type ImportDeclaration,
  type ImportEqualsDeclaration,
  type ImportSpecifier,
  type InterfaceDeclaration,
  type ModuleDeclaration,
  type RenameOptions,
  type SourceFile,
  type Statement,
  type TypeAliasDeclaration,
} from 'ts-morph';
import { TsMorphProject, type ScannedModule } from './tsMorphProject.js';
import { findFreeName, rewriteModuleSpecifierForOutputDirectory } from './utils.js';

/**
 * One name an import declaration binds. `importedName` is `default`, `*` or
 * the exported name. `scannedTargetPath` is the scanned file it points into;
 * otherwise `rewrittenModuleSpecifier` is already rewritten to resolve from the
 * destination.
 */
export type ImportBinding = {
  /** The importing module's path. */
  importerPath: string;
  localName: string;
  importedName: string;
  isTypeOnly: boolean;
  rewrittenModuleSpecifier: string;
  /**
   * Absolute path of the scanned module the import names, or `undefined` when
   * it leads outside the scanned set: a package (`'@pvl/schema'`), a relative
   * file that isn't scanned, a module specifier that resolves to no file, or a
   * namespace import. `undefined` makes this an external import, which the
   * mirror re-imports through `rewrittenModuleSpecifier` instead of copying.
   */
  scannedTargetPath: string | undefined;
  /** The identifier a default or namespace import binds, or a named import's import specifier. */
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
  /** Module specifiers from outside the set, imported for their side effect only. */
  sideEffectModuleSpecifiers: string[];
  /** Exported name → the name it aliases, a declaration or an import, for an `export { … }` with no module specifier and `export default <name>`. */
  aliasedNameByExportedName: Map<string, string>;
  /** Exported name → the declaration's own name, for a declaration carrying `export`. */
  declarationNameByExportedName: Map<string, string>;
  declaredNames: DeclaredName[];
};

type ReadImportBindingsArgs = {
  importerPath: string;
  importDeclaration: ImportDeclaration;
  scannedFilePaths: ReadonlySet<string>;
  outputDirectory: string;
};

export type ReadModuleContextArgs = {
  scannedModule: ScannedModule;
  scannedFilePaths: ReadonlySet<string>;
  outputDirectory: string;
};

export class ModuleContextReader {
  /**
   * Rename options for `identifier.rename(name, RENAME_OPTIONS)`
   *
   * **Options**:
   *  - A shorthand `{ user }` renamed to `account` becomes `{ user: account }`,
   */
  private static readonly RENAME_OPTIONS = {
    usePrefixAndSuffixText: true,
  } as const satisfies RenameOptions;

  /** The name an anonymous default export is given, so a scanned importer can refer to it; suffixed when the module already uses it. */
  private static readonly ANONYMOUS_DEFAULT_EXPORT_NAME = 'defaultExport' as const;

  /**
   * Reads everything one scanned module binds at its top level, which the
   * later steps resolve and rename: its imports, its side-effect-only imports
   * of files outside the set, its own declarations and how each export maps
   * to a local name. First gives an anonymous default export the name
   * `defaultExport`, or `defaultExport_2` and on when that name is taken.
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
  public static read({
    scannedModule,
    scannedFilePaths,
    outputDirectory,
  }: ReadModuleContextArgs): ModuleContext {
    const { path, sourceFile } = scannedModule;
    ModuleContextReader.nameAnonymousDefaultExport(sourceFile);
    const importDeclarations = sourceFile.getImportDeclarations();
    const importBindings = importDeclarations
      .filter((importDeclaration) => !ModuleContextReader.isSideEffectOnlyImport(importDeclaration))
      .flatMap((importDeclaration) =>
        ModuleContextReader.readImportBindings({
          importerPath: path,
          importDeclaration,
          scannedFilePaths,
          outputDirectory,
        }),
      );
    const sideEffectModuleSpecifiers = importDeclarations
      .filter(ModuleContextReader.isSideEffectOnlyImport)
      .map((importDeclaration) => importDeclaration.getModuleSpecifierValue())
      .filter(
        (moduleSpecifier) =>
          TsMorphProject.findAbsoluteScannedFilePath(moduleSpecifier, path, scannedFilePaths) ===
          undefined,
      )
      .map((moduleSpecifier) =>
        rewriteModuleSpecifierForOutputDirectory(moduleSpecifier, path, outputDirectory),
      );
    const aliasedNameByExportedName = ModuleContextReader.readAliasedNameByExportedName(sourceFile);
    return {
      scannedModule,
      importBindings,
      sideEffectModuleSpecifiers,
      aliasedNameByExportedName,
      ...ModuleContextReader.readDeclaredNames(sourceFile, aliasedNameByExportedName),
    };
  }

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
  public static getAliasOrOwnNameOfImportOrExportSpecifier(
    importOrExportSpecifier: ImportSpecifier | ExportSpecifier,
  ): string {
    return importOrExportSpecifier.getAliasNode()?.getText() ?? importOrExportSpecifier.getName();
  }

  /**
   * Checks if the top-level statement is a declaration (is named)
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
  public static isDeclarationTopLevelStatement(topLevelStatement: Statement): boolean {
    return (
      Node.isVariableStatement(topLevelStatement) ||
      ModuleContextReader.isTopLevelStatementSingleNameDeclaration(topLevelStatement)
    );
  }

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
  public static renameAvoidingShadowing(identifier: Identifier, name: string): void {
    ModuleContextReader.renameNestedDeclarationsOf(identifier.getSourceFile(), name);
    identifier.rename(name, ModuleContextReader.RENAME_OPTIONS);
  }

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
  public static renameImportBinding(importBinding: ImportBinding, name: string): void {
    const { bindingNode } = importBinding;
    if (Node.isIdentifier(bindingNode)) {
      ModuleContextReader.renameAvoidingShadowing(bindingNode, name);
      return;
    }
    if (bindingNode.getAliasNode() === undefined) {
      bindingNode.setAlias(bindingNode.getName());
    }
    const aliasIdentifier = bindingNode.getAliasNode();
    if (aliasIdentifier !== undefined) {
      ModuleContextReader.renameAvoidingShadowing(aliasIdentifier, name);
    }
  }

  // Whether a top-level statement declares exactly one name, read with
  // `getNameNode()`. A `const` isn't one: it can declare several names, or
  // destructure.
  //
  //   function format() { … }            // true
  //   class Registry { … }               // true
  //   interface Options { … }            // true
  //   type User = Infer<typeof user>;    // true
  //   enum Role { … }                    // true
  //   namespace Legacy { … }             // true
  //   import fs = require('node:fs');    // true
  //   const user = …, post = …;          // false
  private static isTopLevelStatementSingleNameDeclaration(
    topLevelStatement: Statement,
  ): topLevelStatement is
    | FunctionDeclaration
    | ClassDeclaration
    | InterfaceDeclaration
    | TypeAliasDeclaration
    | EnumDeclaration
    | ModuleDeclaration
    | ImportEqualsDeclaration {
    return (
      Node.isFunctionDeclaration(topLevelStatement) ||
      Node.isClassDeclaration(topLevelStatement) ||
      Node.isInterfaceDeclaration(topLevelStatement) ||
      Node.isTypeAliasDeclaration(topLevelStatement) ||
      Node.isEnumDeclaration(topLevelStatement) ||
      Node.isModuleDeclaration(topLevelStatement) ||
      Node.isImportEqualsDeclaration(topLevelStatement)
    );
  }

  // The identifiers of the names a top-level statement declares at module
  // scope, the ones the Destination File's single scope must keep unique.
  //
  //   const user = …, post = …;          // [user, post]
  //   const { id, meta: { tags } } = …;  // [id, tags]: `meta` is a key, not a name
  //   function format() { … }            // [format]
  //   export default function () { … }  // []: no name yet
  //   console.log('loaded');             // []
  private static getTopLevelNameIdentifiers(topLevelStatement: Statement): Identifier[] {
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
    if (ModuleContextReader.isTopLevelStatementSingleNameDeclaration(topLevelStatement)) {
      const declaredNameNode = topLevelStatement.getNameNode();
      return declaredNameNode !== undefined && Node.isIdentifier(declaredNameNode)
        ? [declaredNameNode]
        : [];
    }
    return [];
  }

  // Whether `identifier` is the name a declaration introduces, at any depth,
  // rather than a reference to one.
  //
  //   const user = …;                 // `user`: true
  //   const build = (input) => …;     // `build`, `input`: true
  //   const { id } = user;            // `id`: true; `user`: false, a reference
  //   function format<T>() { … }      // `format`, `T`: true
  //   return user;                    // `user`: false, a reference
  private static isIdentifierDeclarationName(identifier: Identifier): boolean {
    const declaringNode = identifier.getParent();
    return (
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
      declaringNode.getNameNode() === identifier
    );
  }

  // Whether `identifier` is the name in a declaration nested inside a
  // function, block or class, rather than a top-level one or a reference.
  //
  // Is not top-level
  //
  //   const user = …;                         // `user`: top level, false
  //   const build = (user) => {               // parameter `user`: true
  //     const post = …;                       // `post`: true
  //     return user;                          // a reference: false
  //   };
  private static isIdentifierNestedDeclarationName(identifier: Identifier): boolean {
    const topLevelStatement = identifier.getFirstAncestor((ancestor) =>
      Node.isSourceFile(ancestor.getParent()),
    );
    const isTopLevelName =
      topLevelStatement !== undefined &&
      Node.isStatement(topLevelStatement) &&
      ModuleContextReader.getTopLevelNameIdentifiers(topLevelStatement).includes(identifier);

    return ModuleContextReader.isIdentifierDeclarationName(identifier) && !isTopLevelName;
  }

  // The first of `name`, `name_2`, `name_3`, … that no identifier in
  // `sourceFile` spells, so a name the compiler adds can't clash with one the
  // module declares or reads.
  //
  //   const defaultExport = 'mine';
  //   ModuleContextReader.findUnusedName(sourceFile, 'defaultExport') // 'defaultExport_2'
  private static findUnusedName(sourceFile: SourceFile, name: string): string {
    const usedIdentifierTexts = new Set(
      sourceFile
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .map((identifier) => identifier.getText()),
    );
    return findFreeName(name, (candidate) => usedIdentifierTexts.has(candidate));
  }

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
  private static renameNestedDeclarationsOf(sourceFile: SourceFile, name: string): void {
    const shadowingIdentifiers = sourceFile
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter(
        (identifier) =>
          identifier.getText() === name &&
          ModuleContextReader.isIdentifierNestedDeclarationName(identifier),
      );

    for (const shadowingIdentifier of shadowingIdentifiers) {
      // `name` itself is taken by the identifier being renamed, and each name
      // given out is taken from then on, so every one gets its own suffix.
      shadowingIdentifier.rename(
        ModuleContextReader.findUnusedName(sourceFile, name),
        ModuleContextReader.RENAME_OPTIONS,
      );
    }
  }

  // Gives a module's anonymous default export the name `defaultExport`, so a
  // scanned module importing it has a binding to refer to. When the module
  // already uses `defaultExport`, the name gets a suffix (`defaultExport_2`).
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
  private static nameAnonymousDefaultExport(sourceFile: SourceFile): void {
    for (const topLevelStatement of sourceFile.getStatements()) {
      if (Node.isExportAssignment(topLevelStatement)) {
        const exportedExpression = topLevelStatement.getExpression();
        if (!topLevelStatement.isExportEquals() && !Node.isIdentifier(exportedExpression)) {
          const defaultExportName = ModuleContextReader.findUnusedName(
            sourceFile,
            ModuleContextReader.ANONYMOUS_DEFAULT_EXPORT_NAME,
          );
          topLevelStatement.replaceWithText(
            `const ${defaultExportName} = ${exportedExpression.getText()};\nexport default ${defaultExportName};`,
          );
        }
      } else if (
        (Node.isFunctionDeclaration(topLevelStatement) ||
          Node.isClassDeclaration(topLevelStatement)) &&
        topLevelStatement.isDefaultExport() &&
        topLevelStatement.getNameNode() === undefined
      ) {
        topLevelStatement.rename(
          ModuleContextReader.findUnusedName(
            sourceFile,
            ModuleContextReader.ANONYMOUS_DEFAULT_EXPORT_NAME,
          ),
        );
      }
    }
  }

  // One ImportBinding per name an import declaration binds.
  //
  //   import config, { user as account, type Post } from './models.js';
  //
  //   → { localName: 'config',  importedName: 'default', isTypeOnly: false }
  //     { localName: 'account', importedName: 'user',    isTypeOnly: false }
  //     { localName: 'Post',    importedName: 'Post',    isTypeOnly: true }
  //
  // each carrying the module specifier rewritten for the output directory, and
  // `scannedTargetPath` when `./models.js` is a scanned file.
  private static readImportBindings({
    importerPath,
    importDeclaration,
    scannedFilePaths,
    outputDirectory,
  }: ReadImportBindingsArgs): ImportBinding[] {
    const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
    const fieldsSharedByEveryBinding = {
      importerPath,
      rewrittenModuleSpecifier: rewriteModuleSpecifierForOutputDirectory(
        moduleSpecifier,
        importerPath,
        outputDirectory,
      ),
      scannedTargetPath: TsMorphProject.findAbsoluteScannedFilePath(
        moduleSpecifier,
        importerPath,
        scannedFilePaths,
      ),
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
        localName: ModuleContextReader.getAliasOrOwnNameOfImportOrExportSpecifier(importSpecifier),
        importedName: importSpecifier.getName(),
        isTypeOnly: isDeclarationTypeOnly || importSpecifier.isTypeOnly(),
        bindingNode: importSpecifier,
      })),
    ];
  }

  // Whether an import declaration only runs its module and binds no name.
  //
  //   import './setup.js';                  // true
  //   import 'reflect-metadata';            // true
  //   import { user } from './user.js';     // false
  //   import {} from './user.js';           // true: binds nothing
  private static isSideEffectOnlyImport(importDeclaration: ImportDeclaration): boolean {
    return (
      importDeclaration.getDefaultImport() === undefined &&
      importDeclaration.getNamespaceImport() === undefined &&
      importDeclaration.getNamedImports().length === 0
    );
  }

  // For the exports that alias a binding declared elsewhere in the same
  // module, the name each exported name aliases.
  //
  //   export { user, post as article };  // user → user, article → post
  //   export default user;               // default → user
  //
  // A declaration carrying `export` is read by `readDeclaredNames`, and
  // `export { … } from './other.js'` names another module's binding, so
  // neither is here.
  private static readAliasedNameByExportedName(sourceFile: SourceFile): Map<string, string> {
    const aliasedNameByExportedName = new Map<string, string>();
    for (const exportDeclaration of sourceFile.getExportDeclarations()) {
      if (exportDeclaration.getModuleSpecifierValue() === undefined) {
        for (const exportSpecifier of exportDeclaration.getNamedExports()) {
          aliasedNameByExportedName.set(
            ModuleContextReader.getAliasOrOwnNameOfImportOrExportSpecifier(exportSpecifier),
            exportSpecifier.getName(),
          );
        }
      }
    }
    for (const exportAssignment of sourceFile.getExportAssignments()) {
      const exportedExpression = exportAssignment.getExpression();
      if (!exportAssignment.isExportEquals() && Node.isIdentifier(exportedExpression)) {
        aliasedNameByExportedName.set('default', exportedExpression.getText());
      }
    }
    return aliasedNameByExportedName;
  }

  // Every top-level name the module declares, and for each declaration
  // carrying `export`, the name it is exported under.
  //
  //   export const user = …;               // exported as `user`, under its own name
  //   export default function format() {}  // exported as `default`, not under its own name
  //   const post = …; export { post };     // exported under its own name, via `export { … }`
  //   const draft = …;                     // not exported: may be renamed freely
  private static readDeclaredNames(
    sourceFile: SourceFile,
    aliasedNameByExportedName: ReadonlyMap<string, string>,
  ): Pick<ModuleContext, 'declaredNames' | 'declarationNameByExportedName'> {
    const declarations = sourceFile.getStatements().flatMap((topLevelStatement) => {
      const hasExportKeyword =
        Node.isExportable(topLevelStatement) && topLevelStatement.hasExportKeyword();
      const isDefaultExport = hasExportKeyword && topLevelStatement.hasDefaultKeyword();
      return ModuleContextReader.getTopLevelNameIdentifiers(topLevelStatement).map(
        (nameIdentifier) => ({
          declarationName: nameIdentifier.getText(),
          hasExportKeyword,
          isDefaultExport,
          nameIdentifier,
        }),
      );
    });

    return {
      declaredNames: declarations.map(
        ({ declarationName, hasExportKeyword, isDefaultExport, nameIdentifier }) => ({
          declarationName,
          isExportedUnderOwnName:
            (hasExportKeyword && !isDefaultExport) ||
            aliasedNameByExportedName.get(declarationName) === declarationName,
          nameIdentifier,
        }),
      ),
      declarationNameByExportedName: new Map(
        declarations
          .filter(({ hasExportKeyword }) => hasExportKeyword)
          .map(({ declarationName, isDefaultExport }): [string, string] => [
            isDefaultExport ? 'default' : declarationName,
            declarationName,
          ]),
      ),
    };
  }
}
