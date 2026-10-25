import type { PvlConfig } from '../config/config.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';

/**
 * What a {@link runCompilation} run reports.
 *
 * @example
 * ```ts
 * import { runCompilation } from '@pvl/schema-compiler';
 *
 * const { diagnostics, written, destination } = await runCompilation({ cwd: process.cwd() });
 * if (written) console.log(`wrote ${destination}`);
 * ```
 */
export type CompilationOutput = {
  /** Every diagnostic, errors and warnings alike, in the order they were found. */
  diagnostics: Diagnostic[];
  /** The merged settings, or `undefined` when they couldn't be resolved. */
  settings: PvlConfig | undefined;
  /** The Destination Directory's absolute path, once settings resolved. */
  destination: string | undefined;
  /** Whether the Destination Directory was written. Never `true` when an error fired. */
  written: boolean;
};
