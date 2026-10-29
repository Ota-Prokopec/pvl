import * as path from 'node:path';
import * as stream from 'node:stream';
import * as util from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli/runCli.js';
import {
  DIAGNOSTIC_CODE,
  SEVERITY,
  type CompilationOutput,
  type DiagnosticCode,
} from '../src/index.js';
import { SCHEMA_FILE } from './consts.js';
import {
  configJson,
  createFixture,
  diagnosticCodes,
  type FixtureFiles,
  listFixtureFiles,
  readFixtureFile,
  schemaFile,
} from './helpers.js';

type CliRun = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/** A Writable that keeps every byte written to it, as `text()`. */
const collectingStream = (): { stream: stream.Writable; text: () => string } => {
  let text = '';
  const writable = new stream.Writable({
    write: (chunk, _encoding, callback): void => {
      text += String(chunk);
      callback();
    },
  });
  return { stream: writable, text: () => text };
};

const run = async (cwd: string, argv: ReadonlyArray<string>): Promise<CliRun> => {
  const stdout = collectingStream();
  const stderr = collectingStream();
  const exitCode = await runCli(argv, { cwd, stdout: stdout.stream, stderr: stderr.stream });
  return { exitCode, stdout: stdout.text(), stderr: stderr.text() };
};

/** The first line of `text` holding `needle`. */
const lineWith = (text: string, needle: string): string | undefined => {
  return text.split('\n').find((line) => line.includes(needle));
};

/** The UI's output with its escape codes stripped, so a test reads only its text. */
const runUi = async (cwd: string, argv: ReadonlyArray<string>): Promise<CliRun> => {
  const cliRun = await run(cwd, argv);
  return {
    ...cliRun,
    stdout: util.stripVTControlCharacters(cliRun.stdout),
    stderr: util.stripVTControlCharacters(cliRun.stderr),
  };
};

// `--json` prints one CompilationOutput, so a test reads it back as one.
const runJson = async (
  cwd: string,
  argv: ReadonlyArray<string>,
): Promise<CliRun & { payload: CompilationOutput }> => {
  const result = await run(cwd, [...argv, '--json']);
  return { ...result, payload: JSON.parse(result.stdout) as CompilationOutput };
};

describe('pvl compile: settings from flags', () => {
  it('runs flags-only, with every relative path resolved from the working directory', async () => {
    const root = await createFixture({ 'schemas/user.ts': SCHEMA_FILE });

    const { exitCode, payload } = await runJson(root, [
      'compile',
      '--include',
      'schemas/*.ts',
      '--root-dir',
      'schemas',
      '--destination',
      'out',
    ]);

    expect(exitCode).toBe(0);
    expect(payload.written).toBe(true);
    expect(payload.destination).toBe(path.join(root, 'out'));
    expect(await readFixtureFile(root, 'out/user.ts')).toContain('@generated');
  });

  it('maps every setting flag, and a flag wins over the config file', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({
        include: ['config/*.ts'],
        rootDir: 'config',
        destination: 'config',
      }),
      'schemas/a.ts': SCHEMA_FILE,
      'more/b.ts': SCHEMA_FILE,
    });

    const { payload } = await runJson(root, [
      'compile',
      '--include',
      'schemas/*.ts',
      'more/*.ts',
      '--root-dir',
      '.',
      '--destination',
      'flag',
    ]);

    expect(payload.settings).toEqual({
      include: ['schemas/*.ts', 'more/*.ts'],
      rootDir: '.',
      destination: 'flag',
    });
  });

  it('leaves a setting no flag names to the config file, then the defaults', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ destination: 'out' }),
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const { payload } = await runJson(root, ['compile']);

    expect(payload.settings).toEqual({
      include: ['src/schemas/**/*.ts'],
      rootDir: 'src',
      destination: 'out',
    });
  });

  it('reads the config named by --config, resolving paths from its own directory', async () => {
    const root = await createFixture({
      'apps/web/pvlconfig.json': configJson({ include: ['src/schemas/*.ts'] }),
      'apps/web/src/schemas/user.ts': SCHEMA_FILE,
    });

    const { exitCode, payload } = await runJson(root, [
      'compile',
      '--config',
      'apps/web/pvlconfig.json',
    ]);

    expect(exitCode).toBe(0);
    expect(payload.destination).toBe(path.join(root, 'apps/web/.pvl'));
  });
});

describe('pvl compile: the progress UI', () => {
  it('frames a successful run: the scanned count, each file compiled, where it wrote, and nothing on stderr', async () => {
    const root = await createFixture({
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/order.ts': SCHEMA_FILE,
    });

    const { exitCode, stdout, stderr } = await runUi(root, ['compile', '--destination', 'out']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('pvl compile');
    expect(stdout).toContain('Scanned 2 files');
    expect(stdout).toContain('src/schemas/order.ts');
    expect(stdout).toContain('src/schemas/user.ts');
    expect(stdout).toContain('Compiled 2 files');
    expect(stdout).toMatch(/📁 Written to out\n/);
    expect(stderr).toBe('');
  });

  it('lists a warning on stderr and counts it on the success line', async () => {
    const root = await createFixture({
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/setup.ts': 'const internal = 1;\n',
    });

    const { exitCode, stdout, stderr } = await runUi(root, ['compile', '--destination', 'out']);

    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/warning FILE_EXPORTS_NOTHING: .*setup\.ts/);
    expect(stdout).toContain('📁 Written to out  (⚠️ 1 warning)');
  });

  it('lists every error on stderr, closes with the counts, and writes nothing', async () => {
    const root = await createFixture({
      'src/schemas/user.ts': schemaFile('export const user = pvl.compile(makeUser());'),
      'src/schemas/order.ts': schemaFile('export const order = pvl.compile(makeOrder());'),
    });

    const { exitCode, stdout, stderr } = await runUi(root, ['compile', '--destination', 'out']);

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/error COMPILE_ARGUMENT_UNRESOLVABLE: .*order\.ts/);
    expect(stderr).toMatch(/error COMPILE_ARGUMENT_UNRESOLVABLE: .*user\.ts/);
    expect(stdout).toContain('Compiled 2 files');
    expect(stdout).toMatch(/❌ 2 errors, 0 warnings\. Nothing written\n+$/);
    expect(await listFixtureFiles(root, 'out')).toBe(undefined);
  });

  it('draws a precheck failure after the scan step, with no compile progress', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': 'export const = ;\n' });

    const { exitCode, stdout, stderr } = await runUi(root, ['compile', '--destination', 'out']);

    expect(exitCode).toBe(1);
    expect(stdout).toContain('Scanned 1 file');
    expect(stdout).not.toMatch(/Compiling|Compiled/);
    expect(stderr).toContain('error PARSE_FAILED: ');
  });

  it('draws a config failure with no scan step', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

    const { exitCode, stdout, stderr } = await runUi(root, ['compile']);

    expect(exitCode).toBe(1);
    expect(stdout).not.toContain('Scanned');
    expect(stderr).toContain('error NO_CONFIG: ');
    expect(stdout).toContain('❌ 1 error, 0 warnings. Nothing written');
  });

  it('draws an error in red and a warning in yellow when color is on', async () => {
    vi.stubEnv('FORCE_COLOR', '1');
    vi.stubEnv('NO_COLOR', undefined);
    const red = '\u001B[31m';
    const yellow = '\u001B[33m';
    const failing = await createFixture({ 'src/schemas/user.ts': 'export const = ;\n' });
    const warning = await createFixture({
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/setup.ts': 'const internal = 1;\n',
    });

    const failed = await run(failing, ['compile', '--destination', 'out']);
    const warned = await run(warning, ['compile', '--destination', 'out']);

    expect(lineWith(failed.stderr, 'PARSE_FAILED')).toContain(red);
    expect(lineWith(warned.stderr, 'FILE_EXPORTS_NOTHING')).toContain(yellow);
  });

  it('--strict draws a warning as an error and exits non-zero', async () => {
    const root = await createFixture({
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/setup.ts': 'const internal = 1;\n',
    });

    const { exitCode, stdout, stderr } = await runUi(root, [
      'compile',
      '--destination',
      'out',
      '--strict',
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('error FILE_EXPORTS_NOTHING: ');
    expect(stdout).toContain('❌ 1 error, 0 warnings. Nothing written');
  });

  it('draws a usage error like any other error', async () => {
    const root = await createFixture({});

    const { exitCode, stdout, stderr } = await runUi(root, ['compile', '--destinaton', 'out']);

    expect(exitCode).toBe(1);
    expect(stdout).toContain('pvl compile');
    expect(stderr).toMatch(/error INVALID_ARGUMENTS: .*destinaton/);
    expect(stdout).toContain('❌ 1 error, 0 warnings. Nothing written');
  });

  it.each([[[]], [['--tty']], [['--tty', 'false']]])(
    '--json prints only the payload, whatever %j says',
    async (ttyArgv) => {
      const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

      const { stdout, stderr } = await run(root, [
        'compile',
        '--destination',
        'out',
        '--json',
        ...ttyArgv,
      ]);

      expect(stderr).toBe('');
      expect((JSON.parse(stdout) as CompilationOutput).written).toBe(true);
    },
  );
});

describe('pvl compile: plain output (--tty false)', () => {
  it('reports the written directory on stdout and nothing on stderr', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

    const { exitCode, stdout, stderr } = await run(root, [
      'compile',
      '--destination',
      'out',
      '--tty',
      'false',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Wrote ${path.join(root, 'out')}\n`);
    expect(stderr).toBe('');
  });

  it('prints each diagnostic with its severity and code on stderr', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

    const { exitCode, stdout, stderr } = await run(root, ['compile', '--no-tty']);

    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/^error NO_CONFIG: /);
  });

  it('--json prints the payload as one JSON document and nothing on stderr', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

    const { stderr, payload } = await runJson(root, ['compile']);

    expect(stderr).toBe('');
    expect(payload).toEqual({
      diagnostics: [
        {
          code: DIAGNOSTIC_CODE.NO_CONFIG,
          severity: SEVERITY.ERROR,
          message: expect.any(String),
        },
      ],
      written: false,
    });
  });

  it('exits non-zero on an unknown flag', async () => {
    const root = await createFixture({});

    const { exitCode, stdout, stderr } = await run(root, [
      'compile',
      '--destinaton',
      'out',
      '--tty',
      'false',
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/^error INVALID_ARGUMENTS: .*destinaton/);
  });

  it.each(['--with-types', '--no-with-types', '--watch'])(
    'exits non-zero on the removed %s and writes nothing',
    async (flag) => {
      const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

      const { exitCode, stderr } = await run(root, ['compile', flag, '--tty=false']);

      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/^error INVALID_ARGUMENTS: /);
      expect(await listFixtureFiles(root, '.pvl')).toBe(undefined);
    },
  );

  it('--help prints usage on stdout and exits zero', async () => {
    const root = await createFixture({});

    const { exitCode, stdout } = await run(root, ['compile', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('--destination');
    expect(stdout).toContain('--root-dir');
    expect(stdout).toMatch(/--tty [^-]*\[default: true\]/);
    expect(stdout).not.toContain('with-types');
    expect(stdout).not.toContain('--watch');
  });

  it('exits non-zero without a command', async () => {
    const root = await createFixture({});

    const { exitCode } = await run(root, []);

    expect(exitCode).toBe(1);
  });
});

// One row per diagnostic: the fixture and arguments that raise it.
const ERROR_CASES: ReadonlyArray<{
  code: DiagnosticCode;
  files: FixtureFiles;
  argv: ReadonlyArray<string>;
}> = [
  { code: DIAGNOSTIC_CODE.NO_CONFIG, files: {}, argv: [] },
  { code: DIAGNOSTIC_CODE.CONFIG_UNREADABLE, files: {}, argv: ['--config', 'missing.json'] },
  {
    code: DIAGNOSTIC_CODE.CONFIG_UNREADABLE,
    files: { 'pvlconfig.json': '{ "destination": ' },
    argv: [],
  },
  {
    code: DIAGNOSTIC_CODE.INVALID_CONFIG,
    files: { 'pvlconfig.json': configJson({ include: 'src' }) },
    argv: [],
  },
  {
    code: DIAGNOSTIC_CODE.NO_INPUT_FILES,
    files: {},
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.DESTINATION_UNWRITABLE,
    files: { 'src/schemas/user.ts': SCHEMA_FILE, out: '' },
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.DESTINATION_NOT_EMPTY,
    files: { 'src/schemas/user.ts': SCHEMA_FILE, 'out/keep.txt': '' },
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE,
    files: { 'src/schemas/user.ts': SCHEMA_FILE },
    argv: ['--destination', 'src/schemas/out'],
  },
  {
    code: DIAGNOSTIC_CODE.TSCONFIG_UNREADABLE,
    files: { 'src/schemas/user.ts': SCHEMA_FILE, 'tsconfig.json': '{ "compilerOptions": ' },
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.PARSE_FAILED,
    files: { 'src/schemas/user.ts': 'export const = ;\n' },
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.FILE_OUTSIDE_ROOT_DIR,
    files: { 'src/schemas/user.ts': SCHEMA_FILE },
    argv: ['--destination', 'out', '--root-dir', 'lib'],
  },
  {
    code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
    files: { 'src/schemas/user.ts': schemaFile('export const user = pvl.compile(makeUser());') },
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.RUNTIME_ARGUMENT_IN_IMPORTED_SCHEMA,
    files: {
      'src/shared/name.ts': schemaFile('export const name = pvl.string().max(LIMIT);'),
      'src/schemas/user.ts': schemaFile(
        "import { name } from '../shared/name.js';\nexport const user = pvl.compile(name);",
      ),
    },
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_CYCLE,
    files: {
      'src/schemas/user.ts': schemaFile(
        'const user = pvl.object({ friend: user });\nexport const compiled = pvl.compile(user);',
      ),
    },
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.COMPILE_RESULT_MODIFIED,
    files: {
      'src/schemas/user.ts': schemaFile(
        'export const user = pvl.compile(pvl.object({})).optional();',
      ),
    },
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
    files: {
      'src/schemas/user.ts': schemaFile(
        'export const user = pvl.compile(pvl.object({ tags: pvl.array(pvl.union([pvl.string()])) }));',
      ),
    },
    argv: ['--destination', 'out'],
  },
  // A usage error still comes back as JSON under `--json`.
  {
    code: DIAGNOSTIC_CODE.INVALID_ARGUMENTS,
    files: { 'src/schemas/user.ts': SCHEMA_FILE },
    argv: ['--destinaton', 'out'],
  },
];

describe('pvl compile: errors exit non-zero and write nothing', () => {
  it.each(ERROR_CASES)('$code', async ({ code, files, argv }) => {
    const root = await createFixture(files);

    const { exitCode, payload } = await runJson(root, ['compile', ...argv]);

    expect(exitCode).toBe(1);
    expect(diagnosticCodes(payload)).toEqual([code]);
    expect(payload.written).toBe(false);
  });
});

// One row per warning: the fixture that raises it.
const WARNING_CASES: ReadonlyArray<{ code: DiagnosticCode; files: FixtureFiles }> = [
  {
    code: DIAGNOSTIC_CODE.FILE_EXPORTS_NOTHING,
    files: { 'src/schemas/user.ts': SCHEMA_FILE, 'src/schemas/setup.ts': 'const internal = 1;\n' },
  },
  {
    code: DIAGNOSTIC_CODE.DEFAULT_EXPORT,
    files: { 'src/schemas/user.ts': `${SCHEMA_FILE}export default user;\n` },
  },
  {
    code: DIAGNOSTIC_CODE.SIDE_EFFECT_COPIED,
    files: { 'src/schemas/user.ts': `${SCHEMA_FILE}console.log(user);\n` },
  },
  {
    code: DIAGNOSTIC_CODE.SYMLINK_SKIPPED,
    files: {
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/linked.ts': { symlinkTo: 'user.ts' },
    },
  },
];

describe('pvl compile: warnings', () => {
  it.each(WARNING_CASES)('$code: exits zero and still writes', async ({ code, files }) => {
    const root = await createFixture(files);

    const { exitCode, payload } = await runJson(root, ['compile', '--destination', 'out']);

    expect(exitCode).toBe(0);
    expect(payload.diagnostics).toEqual([
      expect.objectContaining({ code, severity: SEVERITY.WARNING }),
    ]);
    expect(payload.written).toBe(true);
  });

  it.each(WARNING_CASES)(
    '$code: --strict promotes it to an error, exits non-zero and writes nothing',
    async ({ code, files }) => {
      const root = await createFixture(files);

      const { exitCode, payload } = await runJson(root, [
        'compile',
        '--destination',
        'out',
        '--strict',
      ]);

      expect(exitCode).toBe(1);
      expect(payload.diagnostics).toEqual([
        expect.objectContaining({ code, severity: SEVERITY.ERROR }),
      ]);
      expect(await readFixtureFile(root, 'out/schemas/user.ts')).toBe(undefined);
    },
  );

  it('prints a warning on stderr without failing the run', async () => {
    const root = await createFixture({
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/setup.ts': 'const internal = 1;\n',
    });

    const { exitCode, stderr } = await run(root, [
      'compile',
      '--destination',
      'out',
      '--tty',
      'false',
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/^warning FILE_EXPORTS_NOTHING: .*setup\.ts/);
  });
});
