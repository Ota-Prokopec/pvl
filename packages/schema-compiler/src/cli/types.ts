import type { PvlConfigOverrides } from '../config/config.js';

/** Where the CLI writes; `process.stdout` and `process.stderr` fit. */
type CliStream = {
  write: (text: string) => unknown;
};

export type RunCliOptions = {
  /** The working directory `pvl compile` runs in. */
  cwd: string;
  stdout: CliStream;
  stderr: CliStream;
};

// Every setting is also a flag, so the settings come from `PvlConfigOverrides`
// and only the CLI's own flags are listed here.
export type CompileFlags = PvlConfigOverrides & {
  config: string | undefined;
  strict: boolean;
  json: boolean;
};
