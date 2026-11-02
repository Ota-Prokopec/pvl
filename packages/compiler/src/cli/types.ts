import type * as stream from 'node:stream';
import type { PvlConfigOverrides } from '../config/types.js';

export type CliOptions = {
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
  /** `--no-emit` sets it to `false`: every check runs and nothing is written. */
  emit: boolean;
  json: boolean;
  /** Draws the progress UI; `false` prints plain lines. `--json` turns it off too. */
  tty: boolean;
};
