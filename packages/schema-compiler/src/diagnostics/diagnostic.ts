// The shape every compiler diagnostic is reported in.
import { SEVERITY, type DiagnosticCode, type Severity } from './consts.js';

/**
 * One problem the compiler found. Refer to it by `code`, which is stable;
 * `message` is prose for a person and may be reworded.
 *
 * @example
 * ```ts
 * import { compile } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await compile({ cwd: process.cwd() });
 * for (const { severity, code, message } of diagnostics) {
 *   console.error(`${severity} ${code}: ${message}`);
 * }
 * ```
 */
export type Diagnostic = {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  /** The absolute path of the file the diagnostic is about, when there is one. */
  file?: string;
};

/**
 * Whether any of `diagnostics` is an error, which is what stops a run from
 * writing and makes the CLI exit non-zero.
 *
 * @example
 * ```ts
 * import { compile, hasError } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await compile({ cwd: process.cwd() });
 * process.exitCode = hasError(diagnostics) ? 1 : 0;
 * ```
 */
export const hasError = (diagnostics: ReadonlyArray<Diagnostic>): boolean => {
  return diagnostics.some((diagnostic) => diagnostic.severity === SEVERITY.ERROR);
};
