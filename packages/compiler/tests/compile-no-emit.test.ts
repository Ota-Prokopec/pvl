// `runCompilation({ emit: false })`: the same diagnostics as a writing run,
// and nothing on disk changed.
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCompilation } from '../src/compilation/runCompilation.js';
import { SCHEMA_FILE } from './consts.js';
import { configJson, createFixture, type FixtureFiles, schemaFile } from './helpers.js';

/** Every directory and file under `root`, each file with its contents. */
const snapshotTree = async (root: string): Promise<Record<string, string>> => {
  const entries = await fsPromises.readdir(root, { recursive: true, withFileTypes: true });
  const snapshot: Record<string, string> = {};
  for (const entry of entries) {
    const entryPath = path.join(entry.parentPath, entry.name);
    snapshot[path.relative(root, entryPath)] = entry.isFile()
      ? await fsPromises.readFile(entryPath, 'utf8')
      : '<directory>';
  }
  return snapshot;
};

// `writtenBefore`: a writing run goes first, so the destination is a real one.
const CASES: ReadonlyArray<{ name: string; files: FixtureFiles; writtenBefore?: boolean }> = [
  {
    name: 'a clean project with no destination yet',
    files: { 'src/schemas/user.ts': SCHEMA_FILE },
  },
  {
    name: 'a destination a previous run wrote',
    files: { 'src/schemas/user.ts': SCHEMA_FILE },
    writtenBefore: true,
  },
  {
    name: "a crashed run's leftover siblings",
    files: {
      'src/schemas/user.ts': SCHEMA_FILE,
      '.pvl.pvl-tmp/half-written.ts': '',
      '.pvl.pvl-old/.pvl-generated': '',
    },
  },
  {
    name: 'a warning',
    files: { 'src/schemas/user.ts': SCHEMA_FILE, 'src/schemas/setup.ts': 'const internal = 1;\n' },
  },
  {
    name: 'UNSUPPORTED_SCHEMA',
    files: {
      'src/schemas/user.ts': schemaFile(
        'export const user = pvl.compile(pvl.union([pvl.string()]));',
      ),
    },
  },
  {
    name: 'COMPILE_ARGUMENT_UNRESOLVABLE',
    files: { 'src/schemas/user.ts': schemaFile('export const user = pvl.compile(makeUser());') },
  },
  {
    name: 'DESTINATION_NOT_EMPTY',
    files: { 'src/schemas/user.ts': SCHEMA_FILE, '.pvl/keep.txt': '' },
  },
  {
    name: 'DESTINATION_INSIDE_INCLUDE',
    files: {
      'pvlconfig.json': configJson({ destination: 'src/schemas/out' }),
      'src/schemas/user.ts': SCHEMA_FILE,
    },
  },
  {
    name: 'DESTINATION_UNWRITABLE, a destination that is a file',
    files: { 'src/schemas/user.ts': SCHEMA_FILE, '.pvl': '' },
  },
];

describe('runCompilation({ emit: false })', () => {
  it.each(CASES)(
    '$name: changes nothing on disk and reports what a writing run reports',
    async ({ files, writtenBefore }) => {
      const root = await createFixture({ 'pvlconfig.json': configJson({}), ...files });
      if (writtenBefore === true) {
        await runCompilation({ cwd: root });
      }
      const before = await snapshotTree(root);

      const payload = await runCompilation({ cwd: root, emit: false });

      expect(await snapshotTree(root)).toEqual(before);
      expect(payload.written).toBe(false);
      // Nothing changed, so a writing run on the same fixture sees what this one saw.
      const { diagnostics, settings, destination } = await runCompilation({ cwd: root });
      expect(payload).toEqual({ diagnostics, settings, destination, written: false });
    },
  );
});
