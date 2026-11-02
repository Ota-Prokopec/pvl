// The progress contract between runCompilation() and the CLI's UI: the phase a
// run is entering, and what it reports that phase to.

/**
 * The phase a `runCompilation` run is entering, reported to its
 * `ui.onProgress`: `scanning` before the scan, `compiling` once every scanned
 * module passed the precheck, and `writing` before the Destination Directory
 * is written. A run that stops early reports no later phase.
 *
 * @internal Only the CLI's progress UI reads it.
 */
export type CompilationProgress = 'scanning' | 'compiling' | 'writing';

/**
 * What a `runCompilation` run reports its progress to; the CLI's
 * `CompileUi` is one.
 *
 * @internal Only the CLI's progress UI implements it.
 */
export type CompilationUi = {
  onProgress(phase: CompilationProgress): void;
};
