// Every diagnostic `runCompilation()` reports, by code, a case per way it
// is raised, and how one run reports several together.
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCompilation, DIAGNOSTIC_CODE, SEVERITY } from '../src/index.js';
import { SCHEMA_FILE } from './consts.js';
import {
  configJson,
  createFixture,
  diagnosticCodes,
  expectFailure,
  listFixtureFiles,
  readFixtureFile,
} from './helpers.js';

describe('runCompilation(): diagnostics', () => {
  it('NO_CONFIG: no config file and no overrides', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [{ code: DIAGNOSTIC_CODE.NO_CONFIG }]);
  });

  it('CONFIG_UNREADABLE: an explicit config path that does not exist', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

    const payload = await runCompilation({ cwd: root, configPath: 'missing.json' });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.CONFIG_UNREADABLE, file: path.join(root, 'missing.json') },
    ]);
  });

  it('CONFIG_UNREADABLE: a config file that is not valid JSON', async () => {
    const root = await createFixture({
      'pvlconfig.json': '{ "destination": ',
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.CONFIG_UNREADABLE, file: path.join(root, 'pvlconfig.json') },
    ]);
  });

  it('INVALID_CONFIG: one diagnostic per failing setting, naming its path', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ include: 'src/**/*.ts', rootDir: 1, withTypes: 'yes' }),
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    const file = path.join(root, 'pvlconfig.json');
    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.INVALID_CONFIG, file },
      { code: DIAGNOSTIC_CODE.INVALID_CONFIG, file },
      { code: DIAGNOSTIC_CODE.INVALID_CONFIG, file },
    ]);
    expect(payload.diagnostics[0]?.message).toContain('include');
    expect(payload.diagnostics[1]?.message).toContain('rootDir');
    expect(payload.diagnostics[2]?.message).toContain('withTypes');
  });

  it('INVALID_CONFIG: an unknown key, so a typo is reported', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ destinaton: 'out' }),
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.INVALID_CONFIG, file: path.join(root, 'pvlconfig.json') },
    ]);
    expect(payload.diagnostics[0]?.message).toContain('destinaton');
    expect(await listFixtureFiles(root, 'out')).toBe(undefined);
  });

  it('INVALID_CONFIG: a config file that is not an object', async () => {
    const root = await createFixture({
      'pvlconfig.json': '[]',
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.INVALID_CONFIG, file: path.join(root, 'pvlconfig.json') },
    ]);
  });

  it('INVALID_CONFIG: an override of the wrong type, with no file', async () => {
    const root = await createFixture({ 'src/schemas/user.ts': SCHEMA_FILE });

    const payload = await runCompilation({
      cwd: root,
      overrides: { destination: 42 as unknown as string },
    });

    expectFailure(payload, [{ code: DIAGNOSTIC_CODE.INVALID_CONFIG }]);
  });

  it('NO_INPUT_FILES: include matches no file', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ include: ['schemas/*.ts'] }),
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [{ code: DIAGNOSTIC_CODE.NO_INPUT_FILES }]);
    expect(await listFixtureFiles(root, '.pvl')).toBe(undefined);
  });

  it('NO_INPUT_FILES: include matches only directories', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ include: ['src/*'] }),
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [{ code: DIAGNOSTIC_CODE.NO_INPUT_FILES }]);
  });

  it('DESTINATION_INSIDE_INCLUDE: include would match a file written into the destination', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ include: ['src/**/*.ts'], destination: 'src/compiled' }),
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE, file: path.join(root, 'src/compiled') },
    ]);
    expect(await listFixtureFiles(root, 'src/compiled')).toBe(undefined);
  });

  it('DESTINATION_INSIDE_INCLUDE: also outside the base directory', async () => {
    const root = await createFixture({
      'app/pvlconfig.json': configJson({
        include: ['../shared/**/*.ts'],
        rootDir: '../shared',
        destination: '../shared/out',
      }),
      'shared/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: path.join(root, 'app') });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE, file: path.join(root, 'shared/out') },
    ]);
  });

  it('DESTINATION_UNWRITABLE: the destination is an existing file', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ destination: 'out' }),
      'src/schemas/user.ts': SCHEMA_FILE,
      out: 'notes',
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.DESTINATION_UNWRITABLE, file: path.join(root, 'out') },
    ]);
    expect(await readFixtureFile(root, 'out')).toBe('notes');
  });

  it('DESTINATION_UNWRITABLE: a parent of the destination is a file', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ destination: 'notes.txt/out' }),
      'src/schemas/user.ts': SCHEMA_FILE,
      'notes.txt': '',
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.DESTINATION_UNWRITABLE, file: path.join(root, 'notes.txt/out') },
    ]);
    expect(await readFixtureFile(root, 'notes.txt')).toBe('');
  });

  it('DESTINATION_UNWRITABLE: the directory the destination would be created in is read-only', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ destination: 'locked/nested/out' }),
      'src/schemas/user.ts': SCHEMA_FILE,
    });
    await fsPromises.mkdir(path.join(root, 'locked'));
    await fsPromises.chmod(path.join(root, 'locked'), 0o555);

    try {
      const payload = await runCompilation({ cwd: root });

      expectFailure(payload, [
        {
          code: DIAGNOSTIC_CODE.DESTINATION_UNWRITABLE,
          file: path.join(root, 'locked/nested/out'),
        },
      ]);
      expect(await listFixtureFiles(root, 'locked')).toEqual([]);
    } finally {
      await fsPromises.chmod(path.join(root, 'locked'), 0o755);
    }
  });

  it('DESTINATION_NOT_EMPTY: the destination holds files the compiler did not write', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ destination: 'src/app' }),
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/app/main.ts': 'start();\n',
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.DESTINATION_NOT_EMPTY, file: path.join(root, 'src/app') },
    ]);
    expect(await listFixtureFiles(root, 'src/app')).toEqual(['main.ts']);
  });

  it('TSCONFIG_UNREADABLE: the tsconfig is not valid JSON', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'tsconfig.json': '{ "compilerOptions": ',
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.TSCONFIG_UNREADABLE, file: path.join(root, 'tsconfig.json') },
    ]);
    expect(await listFixtureFiles(root, '.pvl')).toBe(undefined);
  });

  it('TSCONFIG_UNREADABLE: the tsconfig extends a file that does not exist', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'tsconfig.json': JSON.stringify({ extends: './missing.json' }),
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.TSCONFIG_UNREADABLE, file: path.join(root, 'tsconfig.json') },
    ]);
  });

  it('TSCONFIG_UNREADABLE: the tsconfig exists but may not be read', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'tsconfig.json': '{}',
      'src/schemas/user.ts': SCHEMA_FILE,
    });
    await fsPromises.chmod(path.join(root, 'tsconfig.json'), 0o000);

    try {
      const payload = await runCompilation({ cwd: root });

      expectFailure(payload, [
        { code: DIAGNOSTIC_CODE.TSCONFIG_UNREADABLE, file: path.join(root, 'tsconfig.json') },
      ]);
    } finally {
      await fsPromises.chmod(path.join(root, 'tsconfig.json'), 0o644);
    }
  });

  it('TSCONFIG_UNREADABLE: not raised for a tsconfig whose include matches no file', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'tsconfig.json': JSON.stringify({ include: ['app/**/*.ts'] }),
      'src/schemas/user.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expect(payload.diagnostics).toEqual([]);
  });

  it('TSCONFIG_UNREADABLE: reported after the destination checks, and before any scanned file', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ include: ['src/**/*.ts'], destination: 'src/compiled' }),
      'tsconfig.json': '{ "compilerOptions": ',
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/broken.ts': 'export const = pvl.object({;\n',
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE, file: path.join(root, 'src/compiled') },
      { code: DIAGNOSTIC_CODE.TSCONFIG_UNREADABLE, file: path.join(root, 'tsconfig.json') },
    ]);
  });

  it('PARSE_FAILED: a scanned file is not valid syntax', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/broken.ts': 'export const = pvl.object({;\n',
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.PARSE_FAILED, file: path.join(root, 'src/schemas/broken.ts') },
    ]);
    expect(await listFixtureFiles(root, '.pvl')).toBe(undefined);
  });

  it('FILE_OUTSIDE_ROOT_DIR: a scanned file is not under rootDir', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ include: ['src/schemas/*.ts', 'lib/*.ts'] }),
      'src/schemas/user.ts': SCHEMA_FILE,
      'lib/helpers.ts': 'export const label = 1;\n',
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.FILE_OUTSIDE_ROOT_DIR, file: path.join(root, 'lib/helpers.ts') },
    ]);
  });

  it('SYMLINK_SKIPPED: one warning per symlink include matches, a dangling one included, which is not mirrored', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ include: ['src/schemas/**/*.ts', 'src/schemas/linked.ts'] }),
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/linked.ts': { symlinkTo: '../../shared/team.ts' },
      'src/schemas/dangling.ts': { symlinkTo: 'missing.ts' },
      'shared/team.ts': SCHEMA_FILE,
    });

    const payload = await runCompilation({ cwd: root });

    expect(payload.diagnostics.map((diagnostic) => ({ ...diagnostic }))).toStrictEqual(
      ['src/schemas/dangling.ts', 'src/schemas/linked.ts'].map((symlinkPath) => ({
        code: DIAGNOSTIC_CODE.SYMLINK_SKIPPED,
        severity: SEVERITY.WARNING,
        message: expect.any(String),
        file: path.join(root, symlinkPath),
      })),
    );
    expect(payload.written).toBe(true);
    expect(await listFixtureFiles(root, '.pvl/schemas')).toEqual(['user.ts']);
  });

  it('SYMLINK_SKIPPED: strict turns it into an error that writes nothing', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/linked.ts': { symlinkTo: 'user.ts' },
    });

    const payload = await runCompilation({ cwd: root, strict: true });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.SYMLINK_SKIPPED, file: path.join(root, 'src/schemas/linked.ts') },
    ]);
    expect(await listFixtureFiles(root, '.pvl')).toBe(undefined);
  });

  it('FILE_EXPORTS_NOTHING: a warning that still writes', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/setup.ts': 'const internal = 1;\n',
    });

    const payload = await runCompilation({ cwd: root });

    expect(payload.diagnostics.map((diagnostic) => ({ ...diagnostic }))).toStrictEqual([
      {
        code: DIAGNOSTIC_CODE.FILE_EXPORTS_NOTHING,
        severity: SEVERITY.WARNING,
        message: expect.any(String),
        file: path.join(root, 'src/schemas/setup.ts'),
      },
    ]);
    expect(payload.written).toBe(true);
    expect(await readFixtureFile(root, '.pvl/schemas/setup.ts')).toContain('const internal = 1;');
  });

  it('SIDE_EFFECT_COPIED: a warning that still copies the statement and writes', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/user.ts': `${SCHEMA_FILE}\nif (process.env.DEBUG) {\n  console.log(user);\n}\n`,
    });

    const payload = await runCompilation({ cwd: root });

    expect(payload.diagnostics.map((diagnostic) => ({ ...diagnostic }))).toStrictEqual([
      {
        code: DIAGNOSTIC_CODE.SIDE_EFFECT_COPIED,
        severity: SEVERITY.WARNING,
        message: expect.any(String),
        file: path.join(root, 'src/schemas/user.ts'),
      },
    ]);
    expect(payload.written).toBe(true);
    expect(await readFixtureFile(root, '.pvl/schemas/user.ts')).toContain('console.log(user);');
  });

  it('SIDE_EFFECT_COPIED: strict turns it into an error that writes nothing', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/user.ts': `${SCHEMA_FILE}console.log(user);\n`,
    });

    const payload = await runCompilation({ cwd: root, strict: true });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.SIDE_EFFECT_COPIED, file: path.join(root, 'src/schemas/user.ts') },
    ]);
    expect(await listFixtureFiles(root, '.pvl')).toBe(undefined);
  });

  it('SIDE_EFFECT_COPIED: not raised for a directive, which runs no code', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/user.ts': `'use strict';\n${SCHEMA_FILE}`,
    });

    const payload = await runCompilation({ cwd: root, strict: true });

    expect(payload.diagnostics).toStrictEqual([]);
    expect(payload.written).toBe(true);
  });

  it('strict: promotes a warning to an error, so the previous output is kept', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/setup.ts': 'const internal = 1;\n',
      '.pvl/.pvl-generated': '',
      '.pvl/index.ts': 'previous output',
    });

    const payload = await runCompilation({ cwd: root, strict: true });

    expectFailure(payload, [
      { code: DIAGNOSTIC_CODE.FILE_EXPORTS_NOTHING, file: path.join(root, 'src/schemas/setup.ts') },
    ]);
    expect(await readFixtureFile(root, '.pvl/index.ts')).toBe('previous output');
  });

  it('COMPILE_ARGUMENT_UNRESOLVABLE: an argument not written in the file, or a spread method argument', async () => {
    const schemaFilePath = 'src/schemas/compiled.ts';
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/user.ts': SCHEMA_FILE,
      [schemaFilePath]: [
        "import { pvl } from '@pvl/schema';",
        "import { user } from './user.js';",
        '',
        'const makeSchema = () => pvl.object({});',
        'const limits = [3] as const;',
        "const options = { message: 'too long' };",
        'export const imported = pvl.compile(user);',
        'export const built = pvl.compile(makeSchema());',
        'export const spread = pvl.compile(pvl.object({ ...user.shape }));',
        'export const spreadArgument = pvl.compile(pvl.array(pvl.string()).max(...limits));',
        "export const spreadOptions = pvl.compile(pvl.string().max(3, { ...options, message: 'long' }));",
        '',
      ].join('\n'),
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(
      payload,
      Array.from({ length: 5 }, () => ({
        code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
        file: path.join(root, schemaFilePath),
      })),
    );
  });

  it('COMPILE_ARGUMENT_UNRESOLVABLE: a factory argument naming what shadows a top-level const', async () => {
    const schemaFilePath = 'src/schemas/compiled.ts';
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      [schemaFilePath]: [
        "import { pvl } from '@pvl/schema';",
        '',
        "const kind = 'user';",
        'const name = pvl.string();',
        "export const makeKind = (kind: 'admin') => pvl.compile(pvl.literal(kind));",
        'export const makeUser = (name: unknown) => pvl.compile(pvl.object({ name }));',
        '',
      ].join('\n'),
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(
      payload,
      Array.from({ length: 2 }, () => ({
        code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
        file: path.join(root, schemaFilePath),
      })),
    );
  });

  it('COMPILE_ARGUMENT_CYCLE: an argument or a factory argument that reaches its own const', async () => {
    const schemaFilePath = 'src/schemas/compiled.ts';
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      [schemaFilePath]: [
        "import { pvl } from '@pvl/schema';",
        '',
        'const user = pvl.object({ friend: user });',
        'const first = second;',
        'const second = first;',
        'export const selfReferencing = pvl.compile(user);',
        'export const mutual = pvl.compile(pvl.object({ name: first }));',
        '',
      ].join('\n'),
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(
      payload,
      Array.from({ length: 2 }, () => ({
        code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_CYCLE,
        file: path.join(root, schemaFilePath),
      })),
    );
  });

  it('UNSUPPORTED_SCHEMA: not raised for a primitive, a literal or an enum pvl.compile() wraps, nor for .optional()/.nullable() on the wrapped Schema', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/compiled.ts': [
        "import { pvl } from '@pvl/schema';",
        '',
        'export const name = pvl.compile(pvl.string().min(1));',
        "export const kind = pvl.compile(pvl.literal('user'));",
        "export const role = pvl.compile(pvl.enum(['A', 'B']));",
        'export const optionalRoot = pvl.compile(pvl.object({}).optional());',
        'export const nullableRoot = pvl.compile(pvl.array(pvl.number()).nullable().optional());',
        '',
      ].join('\n'),
    });

    const payload = await runCompilation({ cwd: root });

    expect(payload.diagnostics).toEqual([]);
    expect(payload.written).toBe(true);
    const mirrored = await readFixtureFile(root, '.pvl/schemas/compiled.ts');
    for (const [index, exportName] of [
      'name',
      'kind',
      'role',
      'optionalRoot',
      'nullableRoot',
    ].entries()) {
      // An array's is built by a generic arrow function, typing its element.
      expect(mirrored).toMatch(
        new RegExp(
          `export const ${exportName} = \\(.*class PvlCompiledSchema${String(index)} implements PvlSchema<`,
        ),
      );
    }
  });

  it('COMPILE_RESULT_MODIFIED: a Modifier chained onto the result, but not validate(), standalone(), shape or element', async () => {
    const schemaFilePath = 'src/schemas/compiled.ts';
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      [schemaFilePath]: [
        "import { pvl } from '@pvl/schema';",
        '',
        'export const user = pvl.compile(pvl.object({})).optional();',
        'export const tags = pvl.compile(pvl.array(pvl.string())).min(1);',
        'export const checked = pvl.compile(pvl.object({})).validate({});',
        'export const marked = pvl.compile(pvl.string()).standalone();',
        'export const shape = pvl.compile(pvl.object({ name: pvl.string().standalone() })).shape;',
        'export const element = pvl.compile(pvl.array(pvl.string().standalone())).element;',
        '',
      ].join('\n'),
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(
      payload,
      Array.from({ length: 2 }, () => ({
        code: DIAGNOSTIC_CODE.COMPILE_RESULT_MODIFIED,
        file: path.join(root, schemaFilePath),
      })),
    );
  });

  it('UNSUPPORTED_SCHEMA: what is not compiled yet, one diagnostic per problem', async () => {
    const schemaFilePath = 'src/schemas/compiled.ts';
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      [schemaFilePath]: [
        "import { pvl } from '@pvl/schema';",
        '',
        'export const deepUnion = pvl.compile(pvl.object({ tags: pvl.array(pvl.object({ id: pvl.union([pvl.string()]), age: pvl.number().coerce() })) }));',
        'export const union = pvl.compile(pvl.union([pvl.string(), pvl.number()]));',
        'export const twice = pvl.compile(pvl.object({ id: pvl.union([pvl.string()]), name: pvl.union([pvl.number()]).optional() }));',
        'export const refined = pvl.compile(pvl.array(pvl.union([pvl.string()])).refine((v) => v.length > 0).transform((v) => v.length));',
        '',
      ].join('\n'),
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(
      payload,
      Array.from({ length: 5 }, () => ({
        code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
        file: path.join(root, schemaFilePath),
      })),
    );
  });

  it('UNSUPPORTED_SCHEMA: a method @pvl/schema does not have, on pvl or chained, only the first in a Schema', async () => {
    const schemaFilePath = 'src/schemas/compiled.ts';
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      [schemaFilePath]: [
        "import { pvl } from '@pvl/schema';",
        '',
        'export const chained = pvl.compile(pvl.string().foo());',
        'export const factory = pvl.compile(pvl.foo());',
        'export const first = pvl.compile(pvl.object({ name: pvl.string().foo(), id: pvl.union([pvl.string()]) }));',
        '',
      ].join('\n'),
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(
      payload,
      Array.from({ length: 3 }, () => ({
        code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
        file: path.join(root, schemaFilePath),
      })),
    );
  });

  it('COMPILE_ARGUMENT_UNRESOLVABLE: a receiver that cannot be read, before a method @pvl/schema does not have chained onto it', async () => {
    const schemaFilePath = 'src/schemas/compiled.ts';
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      [schemaFilePath]: [
        "import { pvl } from '@pvl/schema';",
        '',
        'export const makeName = (z: unknown) => pvl.compile(z.string().foo());',
        '',
      ].join('\n'),
    });

    const payload = await runCompilation({ cwd: root });

    expectFailure(payload, [
      {
        code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
        file: path.join(root, schemaFilePath),
      },
    ]);
  });

  it('reports every error from one run together', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ include: ['src/**/*.ts'], destination: 'src/out' }),
    });

    const payload = await runCompilation({ cwd: root });

    expect(diagnosticCodes(payload)).toEqual([
      DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE,
      DIAGNOSTIC_CODE.NO_INPUT_FILES,
    ]);
  });

  it('reports every mirror error and warning from one run together', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ include: ['src/schemas/*.ts', 'lib/*.ts'] }),
      'src/schemas/user.ts': SCHEMA_FILE,
      'src/schemas/broken.ts': 'export default = ;\n',
      'src/schemas/setup.ts': 'const internal = 1;\n',
      'lib/helpers.ts': 'export const label = 1;\n',
    });

    const payload = await runCompilation({ cwd: root });

    expect(
      payload.diagnostics.map(({ code, severity, file }) => ({ code, severity, file })),
    ).toStrictEqual([
      {
        code: DIAGNOSTIC_CODE.FILE_OUTSIDE_ROOT_DIR,
        severity: SEVERITY.ERROR,
        file: path.join(root, 'lib/helpers.ts'),
      },
      {
        code: DIAGNOSTIC_CODE.PARSE_FAILED,
        severity: SEVERITY.ERROR,
        file: path.join(root, 'src/schemas/broken.ts'),
      },
      {
        code: DIAGNOSTIC_CODE.FILE_EXPORTS_NOTHING,
        severity: SEVERITY.WARNING,
        file: path.join(root, 'src/schemas/setup.ts'),
      },
    ]);
    expect(payload.written).toBe(false);
  });

  it("reports one file's diagnostics in a fixed order, only FILE_OUTSIDE_ROOT_DIR beside PARSE_FAILED, and no pvl.compile(...) error after a precheck error", async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({ include: ['lib/*.ts'] }),
      'lib/broken.ts': 'export default = ;\n',
      'lib/legacy.ts': [
        "import { pvl } from '@pvl/schema';",
        "import { address } from './address.js';",
        '',
        "console.log('loaded');",
        'export const home = pvl.compile(address);',
        '',
      ].join('\n'),
    });

    const payload = await runCompilation({ cwd: root });

    expect(
      payload.diagnostics.map(({ code, severity, file }) => ({ code, severity, file })),
    ).toStrictEqual([
      {
        code: DIAGNOSTIC_CODE.PARSE_FAILED,
        severity: SEVERITY.ERROR,
        file: path.join(root, 'lib/broken.ts'),
      },
      {
        code: DIAGNOSTIC_CODE.FILE_OUTSIDE_ROOT_DIR,
        severity: SEVERITY.ERROR,
        file: path.join(root, 'lib/broken.ts'),
      },
      {
        code: DIAGNOSTIC_CODE.FILE_OUTSIDE_ROOT_DIR,
        severity: SEVERITY.ERROR,
        file: path.join(root, 'lib/legacy.ts'),
      },
      {
        code: DIAGNOSTIC_CODE.SIDE_EFFECT_COPIED,
        severity: SEVERITY.WARNING,
        file: path.join(root, 'lib/legacy.ts'),
      },
    ]);
    expect(payload.written).toBe(false);
  });

  it('reads the pvl.compile(...) calls after a precheck that raised only warnings', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/legacy.ts': [
        "import { pvl } from '@pvl/schema';",
        "import { address } from './address.js';",
        '',
        "console.log('loaded');",
        'export const home = pvl.compile(address);',
        '',
      ].join('\n'),
    });

    const payload = await runCompilation({ cwd: root });

    expect(diagnosticCodes(payload)).toEqual([
      DIAGNOSTIC_CODE.SIDE_EFFECT_COPIED,
      DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
    ]);
    expect(payload.written).toBe(false);
  });
});
