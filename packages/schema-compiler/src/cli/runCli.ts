// `pvl compile`, in process: argv in, an exit code out, every byte of output
// through the streams it is handed. `../bin.ts` wires it to the real process.
import yargs from 'yargs';
import { runCompilation, type RunCompilationPayload } from '../compilation/runCompilation.js';
import type { SettingOverrides } from '../config/config.js';
import { DIAGNOSTIC_CODE } from '../enums.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { Diagnostics } from '../diagnostics/diagnostics.js';

/** Where the CLI writes; `process.stdout` and `process.stderr` fit. */
export type CliStream = {
  write: (text: string) => unknown;
};

export type RunCliOptions = {
  /** working directory that pvl compile runs against*/
  cwd: string;
  stdout: CliStream;
  stderr: CliStream;
};

// Every setting is also a flag, so the settings come from `SettingOverrides`
// and only the CLI's own flags are listed here.
type CompileFlags = SettingOverrides & {
  config: string | undefined;
  strict: boolean;
  json: boolean;
};

// `error NO_CONFIG: …`: severities read as words on a terminal.
const formatDiagnostic = ({ severity, code, message, file }: Diagnostic): string => {
  return `${severity.toLowerCase()} ${code}: ${message}${file === undefined ? '' : ` (${file})`}\n`;
};

type ReportArgs = Pick<RunCliOptions, 'stdout' | 'stderr'> & {
  payload: RunCompilationPayload;
  json: boolean;
};

const report = ({ payload, json, stdout, stderr }: ReportArgs): void => {
  if (json) {
    stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  for (const diagnostic of payload.diagnostics) {
    stderr.write(formatDiagnostic(diagnostic));
  }
  if (payload.written) {
    stdout.write(`Wrote ${payload.destination}\n`);
  }
};

const runCompile = async (
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
          'with-types': {
            type: 'boolean',
            description: "Generate each compiled Schema's Data and Input type aliases",
          },
          watch: {
            type: 'boolean',
            description: 'Recompile on every change',
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
    // yargs failed before it could parse `--json`, so look for it by hand.
    report({
      payload: {
        diagnostics: [new Diagnostic({ code: DIAGNOSTIC_CODE.INVALID_ARGUMENTS, message })],
        settings: undefined,
        destination: undefined,
        written: false,
      },
      json: argv.includes('--json'),
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
