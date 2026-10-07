import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect } from 'vitest';
import { SEVERITY, type CompilePayload, type DiagnosticCode } from '../src/index.js';

/** A fixture project's files, keyed by path relative to its root. */
export type FixtureFiles = Readonly<Record<string, string>>;

const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/**
 * Writes `files` into a fresh temporary directory and returns its real path;
 * every fixture is removed after the test that created it.
 */
export const createFixture = async (files: FixtureFiles): Promise<string> => {
  // `realpath`, so paths the compiler reports compare equal on macOS, where
  // the temporary directory sits behind a `/var` → `/private/var` symlink.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'pvl-compiler-')));
  fixtures.push(root);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
};

/**
 * Symlinks the workspace's built `@pvl/schema` into the fixture at `root`
 * as `node_modules/@pvl/schema`, so both the Destination File and the
 * source it mirrors can be imported and run, to compare their behaviour.
 *
 * ```ts
 * const root = await createFixture({ 'src/schemas/order.ts': ORDER_SOURCE, … });
 * await linkSchemaPackage(root);
 * await compile({ cwd: root });
 * const mirrored = await import(join(root, 'out.ts'));
 * const source = await import(join(root, 'src/schemas/order.ts'));
 * ```
 *
 * Needs `@pvl/schema` built first; `pnpm test` builds it through Turborepo.
 */
export const linkSchemaPackage = async (root: string): Promise<void> => {
  await mkdir(join(root, 'node_modules/@pvl'), { recursive: true });
  await symlink(
    fileURLToPath(new URL('../../schema', import.meta.url)),
    join(root, 'node_modules/@pvl/schema'),
    'dir',
  );
};

/** The contents of `path` under `root`, or `undefined` when it doesn't exist. */
export const readFixtureFile = async (root: string, path: string): Promise<string | undefined> => {
  try {
    return await readFile(join(root, path), 'utf8');
  } catch {
    return undefined;
  }
};

/** Each diagnostic's code, in the order the compiler reported them. */
export const diagnosticCodes = (payload: Pick<CompilePayload, 'diagnostics'>): DiagnosticCode[] =>
  payload.diagnostics.map((diagnostic) => diagnostic.code);

/** A `pvlconfig.json` body. */
export const configJson = (config: Readonly<Record<string, unknown>>): string =>
  JSON.stringify(config);

/** A diagnostic a failed run is expected to report. */
export type ExpectedError = {
  code: DiagnosticCode;
  /** The absolute path it is about; omitted means it names no file. */
  file?: string;
};

/**
 * Asserts a run reported exactly `expected`, each as an error with its
 * `file`, and wrote nothing.
 */
export const expectFailure = (
  payload: CompilePayload,
  expected: ReadonlyArray<ExpectedError>,
): void => {
  expect(payload.diagnostics).toStrictEqual(
    expected.map(({ code, file }) => ({
      code,
      severity: SEVERITY.ERROR,
      message: expect.any(String),
      ...(file === undefined ? {} : { file }),
    })),
  );
  expect(payload.written).toBe(false);
};
