// `pvl compile`, in process: argv in, an exit code out, every byte of output
// through the streams it is handed. `../bin.ts` wires it to the real process.
import yargs from 'yargs';
import { Parser } from 'yargs/helpers';
import type { CompilationOutput } from '../compilation/types.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { report } from './report.js';
import type { RunCliOptions } from './types.js';
import { runCompile } from './runCompile.js';
import { CompileUi } from './compileUi.js';

/**
 * Runs the `pvl` CLI against `argv` (without the `node` and script entries)
 * and resolves to its exit code: `0` on success or with only warnings, `1`
 * on any error, a usage error included.
 */
export const runCli = async (
  argv: ReadonlyArray<string>,
  options: RunCliOptions,
): Promise<number> => {
  let exitCode: number | undefined;
  let failure: Error | undefined;
  let output = '';

  await yargs([...argv])
    .scriptName('pvl')
    .command(
      'compile',
      'Mirror the schema files into the Destination Directory, compiling every pvl.compile(...) Schema',
      (command) =>
        command.options({
          config: {
            type: 'string',
            description: 'Path to pvlconfig.json (default: ./pvlconfig.json, if present)',
          },
          include: {
            type: 'string',
            array: true,
            description: 'Globs selecting the schema files to compile',
          },
          'root-dir': {
            type: 'string',
            description: 'The source root the Destination Directory mirrors (default: src)',
          },
          destination: {
            type: 'string',
            description: 'The Destination Directory to write (default: .pvl)',
          },
          strict: {
            type: 'boolean',
            default: false,
            description: 'Treat warnings as errors',
          },
          json: {
            type: 'boolean',
            default: false,
            description: 'Print the result as JSON on stdout',
          },
          tty: {
            type: 'boolean',
            default: true,
            description: 'Draw the progress UI (false: plain lines)',
          },
        }),
      async (flags) => {
        exitCode = await runCompile(flags, options);
      },
    )
    .demandCommand(1, 'Name a command: pvl compile')
    .strict()
    .version(false)
    .help()
    // With a parse callback, yargs hands over its help and error text
    // instead of printing it and exiting the process itself.
    .parseAsync([...argv], {}, (error, _flags, text) => {
      failure = error ?? undefined;
      output = text;
    })
    .catch((error: unknown) => {
      failure = error instanceof Error ? error : new Error(String(error));
    });

  if (failure !== undefined) {
    const message = `${failure.message} Run \`pvl compile --help\` for usage.`;
    const payload: CompilationOutput = {
      diagnostics: [new Diagnostic({ code: DIAGNOSTIC_CODE.INVALID_ARGUMENTS, message })],
      settings: undefined,
      destination: undefined,
      written: false,
    };
    // yargs failed before it could hand over `--json` and `--tty`, so read
    // them with its own parser.
    const { json, tty } = Parser([...argv], {
      boolean: ['json', 'tty'],
      default: { json: false, tty: true },
    });
    report({
      payload,
      json,
      ui: CompileUi.start({ json, tty }, options),
      stdout: options.stdout,
      stderr: options.stderr,
    });
    return 1;
  }
  if (exitCode === undefined) {
    // `--help` ran instead of a command.
    options.stdout.write(`${output}\n`);
    return 0;
  }
  return exitCode;
};
