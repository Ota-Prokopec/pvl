import type { CompilationOutput } from '../compilation/types.js';
import type { CompileUi } from './compileUi.js';
import type { RunCliOptions } from './types.js';

type ReportArgs = Pick<RunCliOptions, 'stdout' | 'stderr'> & {
  payload: CompilationOutput;
  json: boolean;
  /** The run's UI, which draws the outcome instead when there is one. */
  ui: CompileUi | undefined;
};

export const report = ({ payload, json, ui, stdout, stderr }: ReportArgs): void => {
  if (ui !== undefined) {
    ui.finish(payload);
    return;
  }
  if (json) {
    stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  for (const diagnostic of payload.diagnostics) {
    stderr.write(diagnostic.toString());
  }
  if (payload.written) {
    stdout.write(`Wrote ${payload.destination}\n`);
  }
};
