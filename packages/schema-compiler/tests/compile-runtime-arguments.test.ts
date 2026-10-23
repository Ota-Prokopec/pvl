// How a Compiled Schema evaluates its Runtime Arguments, compared with the
// interpreted path: once, where each is written, in its own scope.
import * as path from 'node:path';
import type { Schema } from '@pvl/schema';
import { describe, expect, it } from 'vitest';
import { runCompilation } from '../src/index.js';
import {
  configJson,
  createFixture,
  describeResult,
  linkSchemaPackage,
  schemaFile,
} from './helpers.js';

// A scanned file whose Runtime Arguments count their evaluations, or are
// names a top-level const of the same name is shadowed by, or read `this`.
const RUNTIME_ARGUMENTS_FILE = schemaFile(
  [
    'export const counts = { getMax: 0, getMin: 0 };',
    'const getMax = (): number => { counts.getMax++; return 3; };',
    'const getMin = (): number => { counts.getMin++; return 1; };',
    'const base = pvl.string().max(getMax());',
    'export const user = pvl.compile(base);',
    'export const getUser = () => pvl.compile(base.min(getMin()));',
    'const MIN = 3;',
    'export const makeName = (MIN: number) => pvl.compile(pvl.string().min(MIN));',
    'export const makeTag = () => {',
    '  const MIN = 5;',
    '  return pvl.compile(pvl.string().min(MIN));',
    '};',
    "const message = 'top-level message';",
    'export const makeTitle = (message: string) => pvl.compile(pvl.string().min(1, { message }));',
    'const MAX = 3;',
    'const capped = pvl.string().max(MAX);',
    'export const makeCapped = (MAX: number) => pvl.compile(capped);',
    'export class Limits {',
    '  max = 2;',
    '  schema = pvl.compile(pvl.string().max(this.max));',
    '}',
  ].join('\n'),
);

type RuntimeArgumentsModule = {
  counts: Readonly<Record<string, number>>;
  user: Pick<Schema<unknown>, 'validate'>;
  getUser: () => Pick<Schema<unknown>, 'validate'>;
  makeName: (min: number) => Pick<Schema<unknown>, 'validate'>;
  makeTag: () => Pick<Schema<unknown>, 'validate'>;
  makeTitle: (message: string) => Pick<Schema<unknown>, 'validate'>;
  makeCapped: (max: number) => Pick<Schema<unknown>, 'validate'>;
  Limits: new () => { schema: Pick<Schema<unknown>, 'validate'> };
};

// A scanned file whose Issue options are a const the call names, which an
// export changes after the Schema is built.
const CONST_OPTIONS_FILE = schemaFile(
  [
    "const OPTIONS = { message: 'too long' };",
    'export const user = pvl.compile(pvl.string().max(3, OPTIONS));',
    'export const renameMessage = (): void => {',
    "  OPTIONS.message = 'way too long';",
    '};',
  ].join('\n'),
);

type ConstOptionsModule = {
  user: Pick<Schema<unknown>, 'validate'>;
  renameMessage: () => void;
};

// A scanned file whose call names a const declared after it, so loading it
// reads the const before it is initialized.
const CONST_DECLARED_LATER_FILE = schemaFile(
  ['export const early = pvl.compile(pvl.string().max(MAX));', 'const MAX = 3;'].join('\n'),
);

// A scanned file whose call names a const that reads itself, so loading it
// reads the const before it is initialized, though compiling it never
// follows the const.
const SELF_REFERENCING_CONST_FILE = schemaFile(
  [
    'const options = { message: options };',
    'export const limited = pvl.compile(pvl.string().max(3, options));',
  ].join('\n'),
);

describe('runCompilation(): Runtime Arguments', () => {
  it('evaluates each one once, where it is written, and binds each name in its own scope, as the interpreted path does', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/runtime.ts': RUNTIME_ARGUMENTS_FILE,
    });
    await linkSchemaPackage(root);
    const payload = await runCompilation({ cwd: root });
    const interpreted = (await import(
      path.join(root, 'src/schemas/runtime.ts')
    )) as RuntimeArgumentsModule;
    const compiled = (await import(
      path.join(root, '.pvl/schemas/runtime.ts')
    )) as RuntimeArgumentsModule;

    expect(payload.diagnostics).toEqual([]);
    for (const module of [interpreted, compiled]) {
      module.getUser();
      module.getUser();
    }
    expect(compiled.counts).toStrictEqual(interpreted.counts);
    expect(compiled.counts).toStrictEqual({ getMax: 1, getMin: 2 });
    for (const value of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', 'abcdef', 1]) {
      for (const [interpretedSchema, compiledSchema] of [
        [interpreted.user, compiled.user],
        [interpreted.getUser(), compiled.getUser()],
        [interpreted.makeName(4), compiled.makeName(4)],
        [interpreted.makeTag(), compiled.makeTag()],
        [interpreted.makeTitle('custom'), compiled.makeTitle('custom')],
        [interpreted.makeCapped(5), compiled.makeCapped(5)],
        [new interpreted.Limits().schema, new compiled.Limits().schema],
      ] as const) {
        expect(describeResult(compiledSchema.validate(value))).toStrictEqual(
          describeResult(interpretedSchema.validate(value)),
        );
      }
    }
  });

  it('reads a const a method argument names where it is written: what it holds once changed, and nothing before it is declared', async () => {
    const root = await createFixture({
      'pvlconfig.json': configJson({}),
      'src/schemas/options.ts': CONST_OPTIONS_FILE,
      'src/schemas/late.ts': CONST_DECLARED_LATER_FILE,
      'src/schemas/cycle.ts': SELF_REFERENCING_CONST_FILE,
    });
    await linkSchemaPackage(root);
    const payload = await runCompilation({ cwd: root });

    expect(payload.diagnostics).toEqual([]);
    const interpreted = (await import(
      path.join(root, 'src/schemas/options.ts')
    )) as ConstOptionsModule;
    const compiled = (await import(
      path.join(root, '.pvl/schemas/options.ts')
    )) as ConstOptionsModule;
    interpreted.renameMessage();
    compiled.renameMessage();
    expect(describeResult(compiled.user.validate('abcd'))).toStrictEqual(
      describeResult(interpreted.user.validate('abcd')),
    );
    expect(describeResult(compiled.user.validate('abcd'))).toMatchObject({
      issues: [{ message: 'way too long' }],
    });
    await expect(import(path.join(root, 'src/schemas/late.ts'))).rejects.toThrow(ReferenceError);
    await expect(import(path.join(root, '.pvl/schemas/late.ts'))).rejects.toThrow(ReferenceError);
    await expect(import(path.join(root, 'src/schemas/cycle.ts'))).rejects.toThrow(ReferenceError);
    await expect(import(path.join(root, '.pvl/schemas/cycle.ts'))).rejects.toThrow(ReferenceError);
  });
});
