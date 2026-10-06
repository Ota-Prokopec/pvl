import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli/runCli.js';
import {
  DIAGNOSTIC_CODE,
  SEVERITY,
  type CompilePayload,
  type DiagnosticCode,
} from '../src/index.js';
import { SCHEMA_FILE } from './consts.js';
import {
  configJson,
  createFixture,
  diagnosticCodes,
  readFixtureFile,
  type FixtureFiles,
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

// `--json` prints one CompilePayload, so a test reads it back as one.
const runJson = async (
  cwd: string,
  argv: ReadonlyArray<string>,
): Promise<CliRun & { payload: CompilePayload }> => {
  const result = await run(cwd, [...argv, '--json']);
  return { ...result, payload: JSON.parse(result.stdout) as CompilePayload };
};

describe('pvl compile: settings from flags', () => {
  it('runs flags-only, with every relative path resolved from the working directory', async () => {
    const root = await createFixture({ 'schemas/user.ts': SCHEMA_FILE });

    const { exitCode, payload } = await runJson(root, [
      'compile',
      '--include',
      'schemas/*.ts',
      '--destination',
      'out.ts',
    ]);

    expect(exitCode).toBe(0);
    expect(payload.written).toBe(true);
    expect(payload.destination).toBe(join(root, 'out.ts'));
    expect(await readFixtureFile(root, 'out.ts')).toContain('@generated');
  });

  it('maps every setting flag, and a flag wins over the config file', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({
        include: ['config/*.ts'],
        destination: 'config.ts',
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
      '--destination',
      'flag.ts',
      '--no-with-types',
      '--watch',
    ]);

    expect(payload.settings).toEqual({
      include: ['schemas/*.ts', 'more/*.ts'],
      destination: 'flag.ts',
      withTypes: false,
      watch: true,
    });
  });

  it('leaves a setting no flag names to the config file, then the defaults', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ destination: 'out.ts', withTypes: false }),
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const { payload } = await runJson(root, ['compile']);

    expect(payload.settings).toEqual({
      include: ['src/schemas/**/*.ts'],
      destination: 'out.ts',
      withTypes: false,
      watch: false,
    });
  });

  it('reads the config named by --config, resolving paths from its own directory', async () => {
    const root = await createFixture({
      'apps/web/pvlconfig.json': configJson({ include: ['schemas/*.ts'], destination: 'out.ts' }),
      'apps/web/schemas/user.ts': SCHEMA_FILE,
    });

    const { exitCode, payload } = await runJson(root, [
      'compile',
      '--config',
      'apps/web/pvlconfig.json',
    ]);

    expect(exitCode).toBe(0);
    expect(payload.destination).toBe(join(root, 'apps/web/out.ts'));
  });
});

describe('pvl compile: output', () => {
  it('reports the written file on stdout and nothing on stderr', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

    const { exitCode, stdout, stderr } = await run(root, ['compile', '--destination', 'out.ts']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(join(root, 'out.ts'));
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

    const { exitCode, stderr } = await run(root, ['compile', '--destinaton', 'out.ts']);

    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/^error INVALID_ARGUMENTS: .*destinaton/);
  });

  it('--help prints usage on stdout and exits zero', async () => {
    const root = await createFixture({});

    const { exitCode, stdout } = await run(root, ['compile', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('--destination');
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
    argv: ['--destination', 'out.ts'],
  },
  {
    code: DIAGNOSTIC_CODE.DESTINATION_UNWRITABLE,
    files: { 'src/schemas/user.ts': SCHEMA_FILE, 'out/keep.txt': '' },
    argv: ['--destination', 'out'],
  },
  {
    code: DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE,
    files: { 'src/schemas/user.ts': SCHEMA_FILE },
    argv: ['--destination', 'src/schemas/out.ts'],
  },
  // A usage error still comes back as JSON under `--json`.
  {
    code: DIAGNOSTIC_CODE.INVALID_ARGUMENTS,
    files: { 'src/schemas/user.ts': SCHEMA_FILE },
    argv: ['--destinaton', 'out.ts'],
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

describe('pvl compile: warnings', () => {
  const files = {
    'src/schemas/user.ts': SCHEMA_FILE,
    'src/schemas/setup.ts': 'console.log("side effect");\n',
  };

  it('FILE_EXPORTS_NOTHING: exits zero and still writes', async () => {
    const root = await createFixture(files);

    const { exitCode, payload } = await runJson(root, ['compile', '--destination', 'out.ts']);

    expect(exitCode).toBe(0);
    expect(payload.diagnostics).toEqual([
      expect.objectContaining({
        code: DIAGNOSTIC_CODE.FILE_EXPORTS_NOTHING,
        severity: SEVERITY.WARNING,
      }),
    ]);
    expect(payload.written).toBe(true);
  });

  it('--strict promotes it to an error: exits non-zero and writes nothing', async () => {
    const root = await createFixture(files);

    const { exitCode, payload } = await runJson(root, [
      'compile',
      '--destination',
      'out.ts',
      '--strict',
    ]);

    expect(exitCode).toBe(1);
    expect(payload.diagnostics).toEqual([
      expect.objectContaining({
        code: DIAGNOSTIC_CODE.FILE_EXPORTS_NOTHING,
        severity: SEVERITY.ERROR,
      }),
    ]);
    expect(await readFixtureFile(root, 'out.ts')).toBe(undefined);
  });

  it('prints a warning on stderr without failing the run', async () => {
    const root = await createFixture(files);

    const { exitCode, stderr } = await run(root, ['compile', '--destination', 'out.ts']);

    expect(exitCode).toBe(0);
    expect(stderr).toMatch(/^warning FILE_EXPORTS_NOTHING: .*setup\.ts/);
  });
});
