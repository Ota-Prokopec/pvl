// `pvl compile`, in process: argv in, an exit code out, every byte of output
// through the streams it is handed. `../bin.ts` wires it to the real process.
import yargs from 'yargs';
import { Parser } from 'yargs/helpers';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { CompileUi } from './compileUi.js';
import { report } from './report.js';
import { runCompile } from './runCompile.js';
import type { CliOptions } from './types.js';

/**
 * Runs the `pvl` CLI against `argv` (without the `node` and script entries)
 * and resolves to its exit code: `0` on success or with only warnings, `1`
 * on any error, a usage error included.
 */
export const runCli = async (argv: ReadonlyArray<string>, options: CliOptions): Promise<number> => {
  // Read `--json` and `--tty` with yargs' own parser, as the UI must exist
  // before yargs runs and a usage error never hands over the parsed flags.
  const { json, tty } = Parser([...argv], {
    boolean: ['json', 'tty'],
    default: { json: false, tty: true },
  });
  const ui = CompileUi.start({ json, tty }, options);
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
        exitCode = await runCompile(flags, options, ui);
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

    report({
      payload: {
        diagnostics: [new Diagnostic({ code: DIAGNOSTIC_CODE.INVALID_ARGUMENTS, message })],
        settings: undefined,
        destination: undefined,
        written: false,
      },
      json,
      ui,
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
