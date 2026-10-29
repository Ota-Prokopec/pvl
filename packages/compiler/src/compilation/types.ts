import type { PvlConfig } from '../config/types.js';
import type { Diagnostic } from '../diagnostics/diagnostic.js';

/**
 * What a {@link runCompilation} run reports.
 *
 * @example
 * ```ts
 * import { runCompilation } from '@pcvl/compiler';
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

/**
 * One step of a {@link runCompilation} run, reported to its `onProgress`:
 * `scanned` once after the scan, `compiling` once per scanned module, before
 * it is read (`file` relative to the base directory, `done` the modules
 * compiled before it), and `writing` once before the Destination Directory is
 * written. A run that stops early sends no further events.
 *
 * @internal Only the CLI's progress UI reads it.
 */
export type CompilationProgress =
  | { phase: 'scanned'; total: number }
  | { phase: 'compiling'; file: string; done: number; total: number }
  | { phase: 'writing' };
