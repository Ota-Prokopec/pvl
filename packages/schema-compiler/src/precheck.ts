// What stops a scanned file from being mirrored, and what is worth a warning
// when it is. Reads the scanned modules before anything is rewritten.
import * as path from 'node:path';
import { Node, ts, type Statement } from 'ts-morph';
import { GenericAst } from './ast/genericAst.js';
import { DIAGNOSTIC_CODE } from './diagnostics/enums.js';
import { Diagnostic } from './diagnostics/diagnostic.js';
import type { Module } from './module/module.js';
import { findMarkedToCompileSchemas, type ModuleCompilation } from './schemas/readSchema.js';

export type PrecheckModulesArgs = {
  /** Every scanned module, in scan order. */
  modules: ReadonlyArray<Module>;
};

export type PrecheckModulesPayload = {
  diagnostics: Diagnostic[];
  /** One per scanned module that parses, in scan order. */
  compilations: ModuleCompilation[];
};

export type PrecheckModulePayload = {
  diagnostics: Diagnostic[];
  /** Its compilation, or `undefined` when it doesn't parse. */
  compilation: ModuleCompilation | undefined;
};

export class Precheck {
  /**
   * Every error and warning the scanned modules raise, collected before any
   * source file is touched so one run reports all the problems instead of
   * stopping at the first, with the compilation of each module that parses.
   * Each module's checks are its `precheckModule`.
   *
   * ```ts
   * // user.ts parses, broken.ts doesn't
   * Precheck.precheckModules({ modules: [<user.ts>, <broken.ts>] })
   * // { diagnostics: […user.ts's diagnostics, PARSE_FAILED (broken.ts)],
   * //   compilations: [{ module: <user.ts>, … }] }
   * ```
   */
  public static precheckModules({ modules }: PrecheckModulesArgs): PrecheckModulesPayload {
    const modulePrechecks = modules.map((module) => Precheck.precheckModule(module));

    return {
      diagnostics: modulePrechecks.flatMap(({ diagnostics }) => diagnostics),
      compilations: modulePrechecks.flatMap(({ compilation }) => compilation ?? []),
    };
  }

  /**
   * Every error and warning `module` raises, with its compilation when it
   * parses.
   *
   * A module with syntax errors gets PARSE_FAILED, and FILE_OUTSIDE_ROOT_DIR
   * when it applies, and has no compilation: the tree TypeScript recovers
   * from broken code holds statements nobody wrote, so every later check
   * needs the module to parse.
   *
   * - PARSE_FAILED: the file isn't valid syntax.
   * - FILE_OUTSIDE_ROOT_DIR: the file isn't under the Root Directory.
   * - FILE_EXPORTS_NOTHING, SIDE_EFFECT_COPIED: warnings.
   * - COMPILE_ARGUMENT_UNRESOLVABLE, COMPILE_ARGUMENT_CYCLE,
   *   COMPILE_RESULT_MODIFIED, UNSUPPORTED_SCHEMA: a `pvl.compile(...)` call
   *   can't be compiled (see findMarkedToCompileSchemas).
   *
   * ```ts
   * // /repo/src/schemas/user.ts
   * import { pvl } from '@pvl/schema';
   * export const user = pvl.compile(pvl.object({ name: pvl.string() }));
   * Precheck.precheckModule(<user.ts>)
   * // { diagnostics: [], compilation: { module: <user.ts>, schemas: [<1 Schema>], … } }
   *
   * // /repo/src/schemas/broken.ts
   * export const user = pvl.object({ name: pvl.string() ;
   * Precheck.precheckModule(<broken.ts>)
   * // { diagnostics: [PARSE_FAILED], compilation: undefined }
   * ```
   */
  private static precheckModule(module: Module): PrecheckModulePayload {
    const parseFailureDiagnostics = Precheck.findParseFailureDiagnostics(module);
    const outsideRootDirectoryDiagnostics = Precheck.findOutsideRootDirectoryDiagnostics(module);
    if (parseFailureDiagnostics.length > 0) {
      return {
        diagnostics: [...parseFailureDiagnostics, ...outsideRootDirectoryDiagnostics],
        compilation: undefined,
      };
    }

    const compilation = findMarkedToCompileSchemas(module);

    return {
      diagnostics: [
        ...outsideRootDirectoryDiagnostics,
        ...Precheck.findWarningsDiagnostics(module),
        ...compilation.diagnostics,
      ],
      compilation,
    };
  }

  /**
   * A PARSE_FAILED error when the scanned module isn't valid syntax, read
   * from the TypeScript compiler's syntactic diagnostics. Only the file's
   * first syntax error is reported, as the later ones are usually its
   * knock-on effects.
   *
   * ```ts
   * // src/schemas/user.ts
   * export const user = pvl.object({ name: pvl.string() ;
   * // → PARSE_FAILED: This file doesn't parse, so it can't be mirrored: ',' expected. (line 1).
   * ```
   *
   * Only syntax is checked: a type error such as `const age: number = 'x'`
   * parses fine and isn't reported.
   */
  private static findParseFailureDiagnostics({
    path: { absolutePath },
    moduleFile,
  }: Module): Diagnostic[] {
    return moduleFile
      .getProject()
      .getProgram()
      .getSyntacticDiagnostics(moduleFile)
      .slice(0, 1)
      .map(
        (syntaxDiagnostic) =>
          new Diagnostic({
            code: DIAGNOSTIC_CODE.PARSE_FAILED,
            message: `This file doesn't parse, so it can't be mirrored: ${ts.flattenDiagnosticMessageText(syntaxDiagnostic.compilerObject.messageText, ' ')} (line ${String(syntaxDiagnostic.getLineNumber())}).`,
            file: absolutePath,
          }),
      );
  }

  /**
   * A FILE_OUTSIDE_ROOT_DIR error when the scanned module is outside the
   * Root Directory, so it has no path inside the mirror.
   *
   * ```ts
   * // rootDir: 'src', include: ['src/**\/*.ts', 'lib/*.ts']
   * // src/schemas/user.ts → fine
   * // lib/helpers.ts      → FILE_OUTSIDE_ROOT_DIR
   * ```
   */
  private static findOutsideRootDirectoryDiagnostics(module: Module): Diagnostic[] {
    if (!Precheck.isOutsideRootDirectory(module)) {
      return [];
    }
    return [
      new Diagnostic({
        code: DIAGNOSTIC_CODE.FILE_OUTSIDE_ROOT_DIR,
        message: `This file isn't under rootDir (${module.path.relativePath.absoluteBase}), so it has no place in the mirror. Move it under rootDir, or point rootDir at a directory holding every included file.`,
        file: module.path.absolutePath,
      }),
    ];
  }

  /**
   * The warnings about what one scanned module brings into the mirror:
   *
   * - FILE_EXPORTS_NOTHING: the file has no export, so nothing in it can be
   *   imported from its mirrored module (`const internal = 1;` alone).
   * - SIDE_EFFECT_COPIED: one per top-level statement that runs code, such as
   *   `console.log('loaded');`, which runs again wherever the mirror is
   *   loaded.
   */
  private static findWarningsDiagnostics({
    path: { absolutePath },
    moduleFile,
  }: Module): Diagnostic[] {
    const exportsNothingWarnings = GenericAst.hasExport(moduleFile)
      ? []
      : [
          new Diagnostic({
            code: DIAGNOSTIC_CODE.FILE_EXPORTS_NOTHING,
            message:
              'This file exports nothing, so nothing can be imported from its mirrored module.',
            file: absolutePath,
          }),
        ];

    const sideEffectWarnings = moduleFile
      .getStatements()
      .filter((statement) => Precheck.hasTopLevelSideEffect(statement))
      .map(
        (statement) =>
          new Diagnostic({
            code: DIAGNOSTIC_CODE.SIDE_EFFECT_COPIED,
            message: `The top-level statement on line ${String(statement.getStartLineNumber())} is copied into the mirror, so it runs again wherever the mirrored module is loaded.`,
            file: absolutePath,
          }),
      );
    return [...exportsNothingWarnings, ...sideEffectWarnings];
  }

  /**
   * Whether the module's path, relative to the Root Directory, leads outside
   * it, so the module has no place in the mirror.
   *
   * ```ts
   * // relativePath: { absoluteBase: '/repo/src', pathFromBase: 'schemas/user.ts' }
   * Precheck.isOutsideRootDirectory(<user.ts>)    // false
   * // relativePath: { absoluteBase: '/repo/src', pathFromBase: '../lib/helpers.ts' }
   * Precheck.isOutsideRootDirectory(<helpers.ts>) // true
   * ```
   */
  private static isOutsideRootDirectory({ path: { relativePath } }: Module): boolean {
    return (
      relativePath.pathFromBase === '..' ||
      relativePath.pathFromBase.startsWith('../') ||
      path.isAbsolute(relativePath.pathFromBase)
    );
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
