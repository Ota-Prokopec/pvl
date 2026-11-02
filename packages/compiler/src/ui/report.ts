// Writes a run's outcome, in every mode: through the UI when there is one,
// as one JSON document under `--json`, as plain lines otherwise.
import type { CliOptions } from '../cli/types.js';
import type { CompilationOutput } from '../compilation/types.js';
import type { CompileUi } from './compileUi.js';

type ReportArgs = Pick<CliOptions, 'stdout' | 'stderr'> & {
  payload: CompilationOutput;
  json: boolean;
  /** The run's UI, which draws the diagnostics and closes its frame when there is one. */
  ui: CompileUi | undefined;
};

export const report = ({ payload, json, ui, stdout, stderr }: ReportArgs): void => {
  if (ui) {
    for (const diagnostic of payload.diagnostics) {
      ui.drawDiagnostic(diagnostic);
    }
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
