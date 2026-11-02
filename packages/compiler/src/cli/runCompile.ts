import type { CompilationOutput } from '../compilation/types.js';
import { runCompilation } from '../compilation/runCompilation.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { isErrorInDiagnostics } from '../diagnostics/utils.js';
import { report } from '../ui/report.js';
import type { CompileFlags, CliOptions } from './types.js';
import type { CompileUi } from '../ui/compileUi.js';

/** The payload of a run that threw: one `INTERNAL_ERROR` carrying the stack. */
const createCrashPayload = (error: unknown): CompilationOutput => {
  const stack = error instanceof Error ? error.stack : String(error);
  const message = `pvl compile crashed. This is a bug in pvl; please report it.\n${stack}`;
  return {
    diagnostics: [new Diagnostic({ code: DIAGNOSTIC_CODE.INTERNAL_ERROR, message })],
    settings: undefined,
    destination: undefined,
    written: false,
  };
};

/**
 * Runs `pvl compile` with its parsed `flags`, drawing the run on `ui` or printing it,
 * and returns its exit code: `1` when an error fired, `0` otherwise.
 */
export const runCompile = async (
  flags: CompileFlags,
  options: CliOptions,
  ui: CompileUi | undefined,
): Promise<number> => {
  const { cwd, stdout, stderr } = options;

  const payload = await runCompilation({
    cwd,
    configPath: flags.config,
    overrides: {
      include: flags.include,
      rootDir: flags.rootDir,
      destination: flags.destination,
    },
    strict: flags.strict,
    emit: flags.emit,
    ui,
  }).catch(createCrashPayload);
  report({ payload, json: flags.json, ui, stdout, stderr });
  return isErrorInDiagnostics(payload.diagnostics) ? 1 : 0;
};
