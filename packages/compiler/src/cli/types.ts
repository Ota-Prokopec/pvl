import type * as stream from 'node:stream';
import type { PvlConfigOverrides } from '../config/types.js';

export type RunCliOptions = {
  /** The working directory `pvl compile` runs in. */
  cwd: string;
  /** Where the CLI writes; `process.stdout` and `process.stderr` fit. */
  stdout: stream.Writable;
  stderr: stream.Writable;
};

// Every setting is also a flag, so the settings come from `PvlConfigOverrides`
// and only the CLI's own flags are listed here.
export type CompileFlags = PvlConfigOverrides & {
  config: string | undefined;
  strict: boolean;
  json: boolean;
  /** Draws the progress UI; `false` prints plain lines. `--json` turns it off too. */
  tty: boolean;
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
