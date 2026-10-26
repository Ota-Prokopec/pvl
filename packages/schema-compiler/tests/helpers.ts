// What every `runCompilation()` test shares: fixture projects in a temporary
// directory, reading their files back, and asserting a run's diagnostics and
// a Compiled Schema's Results.
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as url from 'node:url';
import type { Issue, Result, Schema } from '@pvl/schema';
import { afterEach, expect } from 'vitest';
import { SEVERITY, type CompilationOutput, type DiagnosticCode } from '../src/index.js';

/** A fixture project's files, keyed by path relative to its root. */
export type FixtureFiles = Readonly<Record<string, string>>;

const fixtures: string[] = [];

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((root) => fsPromises.rm(root, { recursive: true, force: true })),
  );
});

/**
 * Writes `files` into a fresh temporary directory and returns its real path;
 * every fixture is removed after the test that created it.
 */
export const createFixture = async (files: FixtureFiles): Promise<string> => {
  // `realpath`, so paths the compiler reports compare equal on macOS, where
  // the temporary directory sits behind a `/var` → `/private/var` symlink.
  const root = await fsPromises.realpath(
    await fsPromises.mkdtemp(path.join(os.tmpdir(), 'pvl-compiler-')),
  );
  fixtures.push(root);
  for (const [filePath, content] of Object.entries(files)) {
    await fsPromises.mkdir(path.dirname(path.join(root, filePath)), { recursive: true });
    await fsPromises.writeFile(path.join(root, filePath), content);
  }
  return root;
};

/**
 * Symlinks the workspace's built `@pvl/schema` into the fixture at `root`
 * as `node_modules/@pvl/schema`, so both a mirrored module and the
 * source it mirrors can be imported and run, to compare their behaviour.
 *
 * ```ts
 * const root = await createFixture({ 'src/schemas/order.ts': ORDER_SOURCE, … });
 * await linkSchemaPackage(root);
 * await runCompilation({ cwd: root });
 * const mirrored = await import(path.join(root, '.pvl/schemas/order.ts'));
 * const source = await import(path.join(root, 'src/schemas/order.ts'));
 * ```
 *
 * Needs `@pvl/schema` built first; `pnpm test` builds it through Turborepo.
 */
export const linkSchemaPackage = async (root: string): Promise<void> => {
  await fsPromises.mkdir(path.join(root, 'node_modules/@pvl'), { recursive: true });
  await fsPromises.symlink(
    url.fileURLToPath(new URL('../../schema', import.meta.url)),
    path.join(root, 'node_modules/@pvl/schema'),
    'dir',
  );
};

/** The contents of `filePath` under `root`, or `undefined` when it doesn't exist. */
export const readFixtureFile = async (
  root: string,
  filePath: string,
): Promise<string | undefined> => {
  try {
    return await fsPromises.readFile(path.join(root, filePath), 'utf8');
  } catch {
    return undefined;
  }
};

/**
 * Every file under `directoryPath` in the fixture at `root`, relative to
 * `directoryPath` with `/` separators, sorted; `undefined` when
 * `directoryPath` doesn't exist.
 *
 * ```ts
 * await listFixtureFiles(root, '.pvl'); // ['.gitignore', '.pvl-generated', 'index.ts', 'schemas/user.ts']
 * ```
 */
export const listFixtureFiles = async (
  root: string,
  directoryPath: string,
): Promise<string[] | undefined> => {
  const directory = path.join(root, directoryPath);
  try {
    const filesAndDirectories = await fsPromises.readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });
    return filesAndDirectories
      .filter((fileOrDirectory) => fileOrDirectory.isFile())
      .map((file) =>
        path
          .relative(directory, path.join(file.parentPath, file.name))
          .split(path.sep)
          .join(path.posix.sep),
      )
      .sort();
  } catch {
    return undefined;
  }
};

/** Each diagnostic's code, in the order the compiler reported them. */
export const diagnosticCodes = (
  payload: Pick<CompilationOutput, 'diagnostics'>,
): DiagnosticCode[] => payload.diagnostics.map((diagnostic) => diagnostic.code);

/**
 * A scanned file holding `source` under the `pvl` import every Schema needs.
 *
 * ```ts
 * schemaFile('export const user = pvl.object({});')
 * // "import { pvl } from '@pvl/schema';\n\nexport const user = pvl.object({});\n"
 * ```
 */
export const schemaFile = (source: string): string =>
  ["import { pvl } from '@pvl/schema';", '', source, ''].join('\n');

/** A module's Schemas by export name, as a test imports a source module or its mirror. */
export type SchemasModule = Readonly<Record<string, Pick<Schema<unknown>, 'validate'>>>;

/** A fixture project a test has compiled: its root, and what the run returned. */
export type CompiledFixture = {
  root: string;
  payload: CompilationOutput;
};

/**
 * A Result as plain data, to compare a Compiled Schema's with the
 * interpreted one's. An Issue is compared by its code, message and path,
 * its class left out; an accepted object, by its keys in order too, which
 * comparing the values alone would miss.
 *
 * ```ts
 * describeResult({ value: { b: 1, a: 2 } }) // { value: { b: 1, a: 2 }, keys: ['b', 'a'] }
 * describeResult({ issues: [<Issue TOO_SMALL at ['name']>] })
 * // { issues: [{ code: 'TOO_SMALL', message: '…', path: ['name'] }] }
 * ```
 */
export const describeResult = (result: Result<unknown>): unknown => {
  if (result.issues) {
    return {
      issues: result.issues.map(({ code, message, path }: Issue) => ({ code, message, path })),
    };
  }
  const { value } = result;
  return {
    value,
    keys: typeof value === 'object' && value !== null ? Reflect.ownKeys(value) : undefined,
  };
};

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
  payload: CompilationOutput,
  expected: ReadonlyArray<ExpectedError>,
): void => {
  // Each Diagnostic's fields, as a plain object: `toStrictEqual` also compares prototypes.
  expect(payload.diagnostics.map((diagnostic) => ({ ...diagnostic }))).toStrictEqual(
    expected.map(({ code, file }) => ({
      code,
      severity: SEVERITY.ERROR,
      message: expect.any(String),
      ...(file === undefined ? {} : { file }),
    })),
  );
  expect(payload.written).toBe(false);
};
