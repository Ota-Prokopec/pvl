// The checks `Precheck` runs on each scanned module, each the diagnostics
// one kind of problem raises, read from the module alone.
import type { Statement } from 'ts-morph';
import { GenericAst } from '../ast/genericAst.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE, type DiagnosticCode } from '../diagnostics/enums.js';
import type { Module } from '../module/module.js';
import { isOutsideBase } from '../path/path.js';

/**
 * A PARSE_FAILED error when TypeScript's parser rejects the module, naming
 * its first error.
 *
 * ```ts
 * // src/schemas/user.ts
 * export const user = pvl.object({ name: pvl.string() ;
 * // → PARSE_FAILED: This file doesn't parse, so it can't be mirrored: ',' expected. (line 1).
 * ```
 */
export const findParseFailureDiagnostics = ({
  path: { absolutePath },
  moduleFile,
}: Module): Diagnostic[] => {
  const parseError = GenericAst.findFirstParseError(moduleFile);
  return parseError === undefined
    ? []
    : [
        new Diagnostic({
          code: DIAGNOSTIC_CODE.PARSE_FAILED,
          message: `This file doesn't parse, so it can't be mirrored: ${parseError.message} (line ${String(parseError.line)}).`,
          file: absolutePath,
        }),
      ];
};

/**
 * A FILE_OUTSIDE_ROOT_DIR error when the module is outside the Root
 * Directory, so it has no path inside the mirror.
 *
 * ```ts
 * // rootDir: 'src', include: ['src/**\/*.ts', 'lib/*.ts']
 * // src/schemas/user.ts → fine
 * // lib/helpers.ts      → FILE_OUTSIDE_ROOT_DIR
 * ```
 */
export const findOutsideRootDirectoryDiagnostics = ({ path: modulePath }: Module): Diagnostic[] => {
  return isOutsideBase(modulePath)
    ? [
        new Diagnostic({
          code: DIAGNOSTIC_CODE.FILE_OUTSIDE_ROOT_DIR,
          message: `This file isn't under rootDir (${modulePath.relativePath.absoluteBase}), so it has no place in the mirror. Move it under rootDir, or point rootDir at a directory holding every included file.`,
          file: modulePath.absolutePath,
        }),
      ]
    : [];
};

export type FindStatementDiagnosticsArgs = {
  module: Module;
  /** Whether a top-level statement raises the diagnostic. */
  isRaisedBy: (statement: Statement) => boolean;
  code: DiagnosticCode;
  /** The message for the statement starting on line `line`. */
  createMessage: (line: number) => string;
};

/**
 * A `code` diagnostic per top-level statement of the module that
 * `isRaisedBy` matches, its message made from the statement's line.
 */
const findStatementDiagnostics = ({
  module: {
    path: { absolutePath },
    moduleFile,
  },
  isRaisedBy,
  code,
  createMessage,
}: FindStatementDiagnosticsArgs): Diagnostic[] => {
  return moduleFile
    .getStatements()
    .filter((statement) => isRaisedBy(statement))
    .map(
      (statement) =>
        new Diagnostic({
          code,
          message: createMessage(statement.getStartLineNumber()),
          file: absolutePath,
        }),
    );
};

/**
 * A DEFAULT_EXPORT warning per top-level statement that exports a default
 * (`GenericAst.isDefaultExport`), in any scanned file, whatever it exports.
 * It is mirrored as written.
 *
 * ```ts
 * export default pvl.string();               // DEFAULT_EXPORT
 * export { user as default };                // DEFAULT_EXPORT
 * export = user;                             // DEFAULT_EXPORT
 * export { default as legacy } from './legacy.js'; // fine: exported under a name
 * ```
 */
export const findDefaultExportDiagnostics = (module: Module): Diagnostic[] => {
  return findStatementDiagnostics({
    module,
    isRaisedBy: (statement) => GenericAst.isDefaultExport(statement),
    code: DIAGNOSTIC_CODE.DEFAULT_EXPORT,
    createMessage: (line) =>
      `The statement on line ${String(line)} exports a default. Export it under a name instead.`,
  });
};

/**
 * A FILE_EXPORTS_NOTHING warning when the module has no export, so nothing
 * in it can be imported from its mirrored module (`const internal = 1;`
 * alone).
 */
export const findExportsNothingDiagnostics = ({
  path: { absolutePath },
  moduleFile,
}: Module): Diagnostic[] => {
  return GenericAst.hasExport(moduleFile)
    ? []
    : [
        new Diagnostic({
          code: DIAGNOSTIC_CODE.FILE_EXPORTS_NOTHING,
          message:
            'This file exports nothing, so nothing can be imported from its mirrored module.',
          file: absolutePath,
        }),
      ];
};

/**
 * A SIDE_EFFECT_COPIED warning per top-level statement that runs code
 * (`GenericAst.isSideEffectStatement`), such as `console.log('loaded');`,
 * which runs again wherever the mirror is loaded.
 */
export const findSideEffectDiagnostics = (module: Module): Diagnostic[] => {
  return findStatementDiagnostics({
    module,
    isRaisedBy: (statement) => GenericAst.isSideEffectStatement(statement),
    code: DIAGNOSTIC_CODE.SIDE_EFFECT_COPIED,
    createMessage: (line) =>
      `The top-level statement on line ${String(line)} is copied into the mirror, so it runs again wherever the mirrored module is loaded.`,
  });
};
