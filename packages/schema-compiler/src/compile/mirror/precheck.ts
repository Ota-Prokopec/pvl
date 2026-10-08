// What stops a scanned file from being mirrored, and what is worth a warning
// when it is. Reads the scanned modules before anything is rewritten.
import { Node, ts, type Project, type Statement } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../../diagnostics/enums.js';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { isOutsideRootDirectory, type ScannedModule } from './scannedModule.js';

/** Names `export *` never re-exports, so they can't clash in the barrel: DEFAULT_EXPORT reports them instead. */
const NAMES_SKIPPED_BY_EXPORT_STAR: ReadonlySet<string> = new Set(['default', 'export=']);

// The first module, by path, to export a name, with what that name is bound to.
type FirstExport = {
  /** Relative to the Root Directory. */
  relativePath: string;
  declarations: ReadonlyArray<Node>;
};

export class Precheck {
  /**
   * A PARSE_FAILED error for each scanned file that isn't valid syntax, read
   * from the TypeScript compiler's syntactic diagnostics. Only a file's first
   * syntax error is reported, as the later ones are usually its knock-on
   * effects.
   *
   * ```ts
   * // src/schemas/user.ts
   * export const user = pvl.object({ name: pvl.string() ;
   * // → PARSE_FAILED: This file doesn't parse, so it can't be mirrored: ',' expected. (line 2).
   * ```
   *
   * Only syntax is checked: a type error such as `const age: number = 'x'`
   * parses fine and isn't reported.
   */
  public static findParseFailuresDiagnostics(
    tsMorphProject: Project,
    scannedModules: ReadonlyArray<ScannedModule>,
  ): Diagnostic[] {
    return scannedModules.flatMap(({ path, sourceFile }) =>
      tsMorphProject
        .getProgram()
        .getSyntacticDiagnostics(sourceFile)
        .slice(0, 1)
        .map((syntaxDiagnostic) =>
          createDiagnostic({
            code: DIAGNOSTIC_CODE.PARSE_FAILED,
            message: `This file doesn't parse, so it can't be mirrored: ${ts.flattenDiagnosticMessageText(syntaxDiagnostic.compilerObject.messageText, ' ')} (line ${String(syntaxDiagnostic.getLineNumber())}).`,
            file: path,
          }),
        ),
    );
  }

  /**
   * A FILE_OUTSIDE_ROOT_DIR error for each scanned module outside the Root
   * Directory, which has no path inside the mirror.
   *
   * ```ts
   * // rootDir: 'src', include: ['src/**\/*.ts', 'lib/*.ts']
   * // src/schemas/user.ts → fine
   * // lib/helpers.ts      → FILE_OUTSIDE_ROOT_DIR
   * ```
   */
  public static findFilesOutsideRootDirectoryDiagnostics(
    scannedModules: ReadonlyArray<ScannedModule>,
    rootDirectory: string,
  ): Diagnostic[] {
    return scannedModules
      .filter(({ relativePath }) => isOutsideRootDirectory(relativePath))
      .map(({ path }) =>
        createDiagnostic({
          code: DIAGNOSTIC_CODE.FILE_OUTSIDE_ROOT_DIR,
          message: `This file isn't under rootDir (${rootDirectory}), so it has no place in the mirror. Move it under rootDir, or point rootDir at a directory holding every included file.`,
          file: path,
        }),
      );
  }

  /**
   * A DEFAULT_EXPORT error for each statement of the scanned module that
   * exports a default, which would have no name in the barrel.
   *
   * ```ts
   * export default pvl.string();               // DEFAULT_EXPORT
   * export default function format() {}        // DEFAULT_EXPORT
   * export { user as default };                // DEFAULT_EXPORT
   * export { default } from './legacy.js';     // DEFAULT_EXPORT
   * export = user;                             // DEFAULT_EXPORT
   * export { default as legacy } from './legacy.js'; // fine: exported by name
   * export const user = pvl.object({ … });     // fine
   * ```
   */
  public static findDefaultExportsDiagnostics({ path, sourceFile }: ScannedModule): Diagnostic[] {
    return sourceFile
      .getStatements()
      .filter((statement) => Precheck.exportsDefault(statement))
      .map((statement) =>
        createDiagnostic({
          code: DIAGNOSTIC_CODE.DEFAULT_EXPORT,
          message: `The statement on line ${String(statement.getStartLineNumber())} exports a default, which would have no name in the barrel. Export it by name instead.`,
          file: path,
        }),
      );
  }

  /**
   * A DUPLICATE_EXPORT error for each name a scanned module exports that an
   * earlier one, by path, already exports bound to something else: the
   * barrel's `export *` of both would be ambiguous, so neither would be
   * exported. Re-exports are followed to their declarations, so re-exporting
   * a binding under the name it already has isn't a clash.
   *
   * ```ts
   * // src/schemas/a.ts: export const user = pvl.object({ … });
   * // src/schemas/b.ts: export const user = pvl.object({ … });   // DUPLICATE_EXPORT on b.ts
   * // src/schemas/c.ts: export { user } from './a.js';           // fine: the same binding
   * ```
   */
  public static findDuplicateExportsDiagnostics(
    scannedModules: ReadonlyArray<ScannedModule>,
  ): Diagnostic[] {
    const firstExportByExportedName = new Map<string, FirstExport>();
    const duplicateExportDiagnostics: Diagnostic[] = [];
    for (const { path, relativePath, sourceFile } of [...scannedModules].sort((first, second) =>
      first.relativePath < second.relativePath ? -1 : 1,
    )) {
      for (const [exportedName, declarations] of sourceFile.getExportedDeclarations()) {
        const firstExport = firstExportByExportedName.get(exportedName);
        if (NAMES_SKIPPED_BY_EXPORT_STAR.has(exportedName)) {
          continue;
        }
        if (firstExport === undefined) {
          firstExportByExportedName.set(exportedName, { relativePath, declarations });
        } else if (!Precheck.isSameBinding(firstExport.declarations, declarations)) {
          duplicateExportDiagnostics.push(
            createDiagnostic({
              code: DIAGNOSTIC_CODE.DUPLICATE_EXPORT,
              message: `\`${exportedName}\` is also exported by ${firstExport.relativePath}, bound to something else, so the barrel can't re-export both. Rename one of them.`,
              file: path,
            }),
          );
        }
      }
    }
    return duplicateExportDiagnostics;
  }

  /**
   * The warnings about what one scanned module brings into the mirror:
   *
   * - FILE_EXPORTS_NOTHING: the file has no export, so nothing in it can be
   *   imported from its mirrored module or the barrel (`const internal = 1;`
   *   alone).
   * - SIDE_EFFECT_COPIED: one per top-level statement that runs code, such as
   *   `console.log('loaded');`, which runs again wherever the mirror is
   *   loaded.
   */
  public static findWarningsDiagnostics({ path, sourceFile }: ScannedModule): Diagnostic[] {
    const topLevelStatements = sourceFile.getStatements();
    const exportsNothingWarnings = Precheck.hasExport(topLevelStatements)
      ? []
      : [
          createDiagnostic({
            code: DIAGNOSTIC_CODE.FILE_EXPORTS_NOTHING,
            message:
              'This file exports nothing, so nothing can be imported from its mirrored module or the barrel.',
            file: path,
          }),
        ];

    const sideEffectWarnings = topLevelStatements
      .filter((statement) => Precheck.hasTopLevelSideEffect(statement))
      .map((statement) =>
        createDiagnostic({
          code: DIAGNOSTIC_CODE.SIDE_EFFECT_COPIED,
          message: `The top-level statement on line ${String(statement.getStartLineNumber())} is copied into the mirror, so it runs again wherever the mirrored module is loaded.`,
          file: path,
        }),
      );
    return [...exportsNothingWarnings, ...sideEffectWarnings];
  }

  /**
   * Whether any of the top-level statements exports a name, in any form:
   *
   * ```ts
   * export const user = …;        export { user };
   * export * from './user.js';    export type User = …;
   * ```
   *
   * A file of only `const internal = 1;` exports nothing.
   */
  public static hasExport(topLevelStatements: ReadonlyArray<Statement>): boolean {
    return topLevelStatements.some(
      (statement) =>
        Node.isExportDeclaration(statement) ||
        Node.isExportAssignment(statement) ||
        (Node.isExportable(statement) && statement.hasExportKeyword()),
    );
  }

  // Whether two exports of one name are bound to the same declarations, as a
  // re-export of a binding is; ESM then treats `export *` of both as one export.
  //
  //   // user.ts: export const user = …;    forward.ts: export { user } from './user.js';
  //   → same: both lead to user.ts's `user`
  //   // a.ts: export const user = …;       b.ts: export const user = …;
  //   → different
  private static isSameBinding(
    firstDeclarations: ReadonlyArray<Node>,
    laterDeclarations: ReadonlyArray<Node>,
  ): boolean {
    return (
      firstDeclarations.length === laterDeclarations.length &&
      laterDeclarations.every((declaration) => firstDeclarations.includes(declaration))
    );
  }

  // Whether a top-level statement exports a default, in any of its forms:
  //
  //   export default user;                    // true
  //   export = user;                          // true
  //   export default class Registry {}        // true
  //   export { user as default };             // true
  //   export { default } from './legacy.js';  // true
  //   export { default as legacy } from './legacy.js'; // false: named `legacy`
  //   export * from './user.js';              // false: `export *` skips defaults
  private static exportsDefault(statement: Statement): boolean {
    if (Node.isExportAssignment(statement)) {
      return true;
    }
    if (Node.isExportDeclaration(statement)) {
      return statement
        .getNamedExports()
        .some(
          (exportSpecifier) =>
            (exportSpecifier.getAliasNode()?.getText() ?? exportSpecifier.getName()) === 'default',
        );
    }
    return Node.isExportable(statement) && statement.isDefaultExport();
  }

  // Whether a top-level statement does something when its module is
  // evaluated, rather than only declaring a name. A declaration's initializer
  // doesn't count, since building a Schema is exactly that.
  //
  //   console.log('loaded');                 // side effect
  //   registry.add(user);                    // side effect
  //   if (debug) { … }                       // side effect
  //   export const user = pvl.object({ … }); // declaration: no
  //   function format() { … }                // declaration: no
  //   import { pvl } from '@pvl/schema';     // import: no
  //   export { user as account };            // export: no
  private static hasTopLevelSideEffect(statement: Statement): boolean {
    return !(
      Node.isVariableStatement(statement) ||
      Node.isFunctionDeclaration(statement) ||
      Node.isClassDeclaration(statement) ||
      Node.isInterfaceDeclaration(statement) ||
      Node.isTypeAliasDeclaration(statement) ||
      Node.isEnumDeclaration(statement) ||
      Node.isModuleDeclaration(statement) ||
      Node.isImportEqualsDeclaration(statement) ||
      Node.isImportDeclaration(statement) ||
      Node.isExportDeclaration(statement) ||
      Node.isExportAssignment(statement) ||
      Node.isEmptyStatement(statement)
    );
  }
}
