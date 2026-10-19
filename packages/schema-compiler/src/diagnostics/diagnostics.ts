// What can be asked of or done to every diagnostic a compilation found.
import type { Diagnostic } from './diagnostic.js';

/**
 * Helpers over every diagnostic a compilation found. A static-only class: it
 * holds no state and is never instantiated.
 *
 * ## Public functions
 *
 * ### `Diagnostics.hasError(diagnostics)`
 *
 * Whether any of them is an error, which stops a run from writing and makes
 * the CLI exit non-zero.
 *
 * ### `Diagnostics.promote(diagnostics)`
 *
 * Every one of them as an error, which is what `strict` reports.
 *
 * @example
 * ```ts
 * import { runCompilation, Diagnostics } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await runCompilation({ cwd: process.cwd() });
 * process.exitCode = Diagnostics.hasError(diagnostics) ? 1 : 0;
 * ```
 */
export class Diagnostics {
  /**
   * Whether any of `diagnostics` is an error.
   *
   * @example
   * ```ts
   * Diagnostics.hasError([noConfig]); // true: NO_CONFIG is an error
   * Diagnostics.hasError([exportsNothing]); // false: FILE_EXPORTS_NOTHING is a warning
   * Diagnostics.hasError([]); // false
   * ```
   */
  public static hasError(diagnostics: ReadonlyArray<Diagnostic>): boolean {
    return diagnostics.some((diagnostic) => diagnostic.isError());
  }

  /**
   * Every one of `diagnostics` as an error (see `Diagnostic.promote()`).
   *
   * @example
   * ```ts
   * Diagnostics.promote([exportsNothing]).map(({ severity }) => severity); // ['ERROR']
   * ```
   */
  public static promote(diagnostics: ReadonlyArray<Diagnostic>): Diagnostic[] {
    return diagnostics.map((diagnostic) => diagnostic.promote());
  }
}
