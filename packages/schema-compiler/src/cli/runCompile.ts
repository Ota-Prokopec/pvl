import { runCompilation } from '../compilation/runCompilation.js';
import { Diagnostics } from '../diagnostics/utils.js';
import { report } from './report.js';
import type { CompileFlags, RunCliOptions } from './types.js';

/**
 *
 * @param flags
 * @param param1
 * @returns exit code (1 = has errors, 0 = no errors)
 */
export const runCompile = async (
  flags: CompileFlags,
  { cwd, stdout, stderr }: RunCliOptions,
): Promise<number> => {
  const payload = await runCompilation({
    cwd,
    configPath: flags.config,
    overrides: {
      include: flags.include,
      rootDir: flags.rootDir,
      destination: flags.destination,
      withTypes: flags.withTypes,
      watch: flags.watch,
    },
    strict: flags.strict,
  });
  report({ payload, json: flags.json, stdout, stderr });
  return Diagnostics.hasError(payload.diagnostics) ? 1 : 0;
};
