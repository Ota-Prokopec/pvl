// What stops a scanned file from being mirrored, and what is worth a warning
// when it is. Reads the scanned modules before anything is rewritten.
import { Node, ts, type Project, type Statement } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../../diagnostics/consts.js';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { isOutsideRootDirectory, type ScannedModule } from './scannedModule.js';

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
  public static findParseFailures(
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
  public static findFilesOutsideRootDirectory(
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
  public static findDefaultExports({ path, sourceFile }: ScannedModule): Diagnostic[] {
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
   * The warnings about what one scanned module brings into the mirror:
   *
   * - FILE_EXPORTS_NOTHING: the file has no export, so nothing in it can be
   *   imported from its mirrored module or the barrel (`const internal = 1;`
   *   alone).
   * - SIDE_EFFECT_COPIED: one per top-level statement that runs code, such as
   *   `console.log('loaded');`, which runs again wherever the mirror is
   *   loaded.
   */
  public static findWarnings({ path, sourceFile }: ScannedModule): Diagnostic[] {
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
