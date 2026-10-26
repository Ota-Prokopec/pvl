import type { CompilationOutput } from '../compilation/types.js';
import type { RunCliOptions } from './types.js';

type ReportArgs = Pick<RunCliOptions, 'stdout' | 'stderr'> & {
  payload: CompilationOutput;
  json: boolean;
};

export const report = ({ payload, json, stdout, stderr }: ReportArgs): void => {
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
