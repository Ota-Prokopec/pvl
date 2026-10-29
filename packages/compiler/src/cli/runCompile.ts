import { runCompilation } from '../compilation/runCompilation.js';
import { isErrorInDiagnostics } from '../diagnostics/utils.js';
import { report } from './report.js';
import type { CompileFlags, RunCliOptions } from './types.js';
import { CompileUi } from './compileUi.js';

/**
 * Runs `pvl compile` with its parsed `flags`, drawing or printing the run,
 * and returns its exit code: `1` when an error fired, `0` otherwise.
 */
export const runCompile = async (flags: CompileFlags, options: RunCliOptions): Promise<number> => {
  const { cwd, stdout, stderr } = options;
  const ui = CompileUi.start(flags, options);
  const payload = await runCompilation({
    cwd,
    configPath: flags.config,
    overrides: {
      include: flags.include,
      rootDir: flags.rootDir,
      destination: flags.destination,
    },
    strict: flags.strict,
    onProgress: ui?.onProgress.bind(ui),
  });
  report({ payload, json: flags.json, ui, stdout, stderr });
  return isErrorInDiagnostics(payload.diagnostics) ? 1 : 0;
};
