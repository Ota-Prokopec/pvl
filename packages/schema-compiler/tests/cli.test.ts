import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli/runCli.js';
import {
  DIAGNOSTIC_CODE,
  SEVERITY,
  type RunCompilationPayload,
  type DiagnosticCode,
} from '../src/index.js';
import { SCHEMA_FILE } from './consts.js';
import {
  configJson,
  createFixture,
  diagnosticCodes,
  type FixtureFiles,
  readFixtureFile,
  schemaFile,
} from './helpers.js';

type CliRun = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const run = async (cwd: string, argv: ReadonlyArray<string>): Promise<CliRun> => {
  let stdout = '';
  let stderr = '';
  const exitCode = await runCli(argv, {
    cwd,
    stdout: { write: (text: string) => (stdout += text) },
    stderr: { write: (text: string) => (stderr += text) },
  });
  return { exitCode, stdout, stderr };
};

// `--json` prints one RunCompilationPayload, so a test reads it back as one.
const runJson = async (
  cwd: string,
  argv: ReadonlyArray<string>,
): Promise<CliRun & { payload: RunCompilationPayload }> => {
  const result = await run(cwd, [...argv, '--json']);
  return { ...result, payload: JSON.parse(result.stdout) as RunCompilationPayload };
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
    expect(payload.destination).toBe(join(root, 'out'));
    expect(await readFixtureFile(root, 'out/user.ts')).toContain('@generated');
  });

  it('maps every setting flag, and a flag wins over the config file', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({
        include: ['config/*.ts'],
        rootDir: 'config',
        destination: 'config',
        withTypes: true,
        watch: false,
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
      '--no-with-types',
      '--watch',
    ]);

    expect(payload.settings).toEqual({
      include: ['schemas/*.ts', 'more/*.ts'],
      rootDir: '.',
      destination: 'flag',
      withTypes: false,
      watch: true,
    });
  });

  it('leaves a setting no flag names to the config file, then the defaults', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ destination: 'out', withTypes: false }),
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const { payload } = await runJson(root, ['compile']);

    expect(payload.settings).toEqual({
      include: ['src/schemas/**/*.ts'],
      rootDir: 'src',
      destination: 'out',
      withTypes: false,
      watch: false,
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
    expect(payload.destination).toBe(join(root, 'apps/web/.pvl'));
  });
});

describe('pvl compile: output', () => {
  it('reports the written directory on stdout and nothing on stderr', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

    const { exitCode, stdout, stderr } = await run(root, ['compile', '--destination', 'out']);

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Wrote ${join(root, 'out')}\n`);
    expect(stderr).toBe('');
  });

  it('prints each diagnostic with its severity and code on stderr', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

    const { exitCode, stdout, stderr } = await run(root, ['compile']);

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

    const { exitCode, stderr } = await run(root, ['compile', '--destinaton', 'out']);

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/^error INVALID_ARGUMENTS: .*destinaton/);
  });

  it('--help prints usage on stdout and exits zero', async () => {
    const root = await createFixture({});

    const { exitCode, stdout } = await run(root, ['compile', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('--destination');
    expect(stdout).toContain('--root-dir');
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
    code: DIAGNOSTIC_CODE.DEFAULT_EXPORT,
    files: { 'src/schemas/user.ts': 'export default 1;\n' },
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
    files: { 'src/schemas/user.ts': schemaFile('export const user = pvl.compile(makeUser());') },
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_NOT_COMPOSITE,
    files: { 'src/schemas/user.ts': schemaFile('export const user = pvl.compile(pvl.string());') },
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
  {
    code: DIAGNOSTIC_CODE.DUPLICATE_EXPORT,
    files: { 'src/schemas/a.ts': SCHEMA_FILE, 'src/schemas/b.ts': SCHEMA_FILE },
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
    code: DIAGNOSTIC_CODE.SIDE_EFFECT_COPIED,
    files: { 'src/schemas/user.ts': `${SCHEMA_FILE}console.log(user);\n` },
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
      expect(await readFixtureFile(root, 'out/index.ts')).toBe(undefined);
    },
  );

  it('prints a warning on stderr without failing the run', async () => {
    const root = await createFixture({
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/setup.ts': 'const internal = 1;\n',
    });

    const { exitCode, stderr } = await run(root, ['compile', '--destination', 'out']);

    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/^warning FILE_EXPORTS_NOTHING: .*setup\.ts/);
  });
});
