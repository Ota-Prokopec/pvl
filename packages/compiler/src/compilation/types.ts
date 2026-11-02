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
 * The phase a {@link runCompilation} run is entering, reported to its
 * `ui.onProgress`: `scanning` before the scan, `compiling` once every scanned
 * module passed the precheck, and `writing` before the Destination Directory
 * is written. A run that stops early reports no later phase.
 *
 * @internal Only the CLI's progress UI reads it.
 */
export type CompilationProgress = 'scanning' | 'compiling' | 'writing';

/**
 * What a {@link runCompilation} run reports its progress to; the CLI's
 * `CompileUi` is one.
 *
 * @internal Only the CLI's progress UI implements it.
 */
export type CompilationUi = {
  onProgress(phase: CompilationProgress): void;
};
