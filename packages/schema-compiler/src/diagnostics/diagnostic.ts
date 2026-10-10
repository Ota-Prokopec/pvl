// One problem the compiler found, and what can be asked of or done to it.
import { DIAGNOSTIC_SEVERITY } from '../consts.js';
import { SEVERITY, type DiagnosticCode, type Severity } from '../enums.js';

export type DiagnosticOptions = {
  code: DiagnosticCode;
  message: string;
  file?: string;
  /** Overrides the code's own severity (`DIAGNOSTIC_SEVERITY`); `promote()` passes it. */
  severity?: Severity;
};

/**
 * One problem the compiler found. Refer to it by `code`, which is stable;
 * `message` is prose for a person and may be reworded. Its `severity` is its
 * code's own (`DIAGNOSTIC_SEVERITY`) unless it was promoted.
 *
 * ## Public functions
 *
 * ### `diagnostic.isError()`
 *
 * Whether it is an error, which stops a run from writing.
 *
 * ### `diagnostic.promote()`
 *
 * A copy of it as an error, which is what `strict` reports. An error stays an
 * error, so promoting twice changes nothing.
 *
 * @example
 * ```ts
 * import { runCompilation } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await runCompilation({ cwd: process.cwd() });
 * for (const { severity, code, message } of diagnostics) {
 *   console.error(`${severity} ${code}: ${message}`);
 * }
 * ```
 */
export class Diagnostic {
  public readonly code: DiagnosticCode;
  public readonly severity: Severity;
  public readonly message: string;
  /** The absolute path of the file the diagnostic is about, when there is one. */
  public readonly file?: string;

  /**
   * A diagnostic with `code`'s own severity, or `severity` when given.
   *
   * @example
   * ```ts
   * new Diagnostic({ code: 'FILE_EXPORTS_NOTHING', message, file }).severity; // 'WARNING'
   * ```
   */
  constructor({ code, message, file, severity }: DiagnosticOptions) {
    this.code = code;
    this.severity = severity ?? DIAGNOSTIC_SEVERITY[code];
    this.message = message;
    if (file !== undefined) {
      this.file = file;
    }
  }

  /**
   * Whether it is an error, which stops a run from writing.
   *
   * @example
   * ```ts
   * new Diagnostic({ code: 'NO_CONFIG', message }).isError(); // true
   * new Diagnostic({ code: 'FILE_EXPORTS_NOTHING', message }).isError(); // false
   * ```
   */
  public isError(): boolean {
    return this.severity === SEVERITY.ERROR;
  }

  /**
   * A copy of it as an error, which is what `strict` reports. An error stays
   * an error, so promoting twice changes nothing.
   *
   * @example
   * ```ts
   * new Diagnostic({ code: 'FILE_EXPORTS_NOTHING', message }).promote().severity; // 'ERROR'
   * ```
   */
  public promote(): Diagnostic {
    return new Diagnostic({ ...this, severity: SEVERITY.ERROR });
  }
}
