// How each factory's argument is read, one `describe` per Schema subclass,
// through `runCompilation()`: what a read argument compiles to, and what
// can't be read.
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCompilation, DIAGNOSTIC_CODE, type DiagnosticCode } from '../src/index.js';
import {
  configJson,
  createFixture,
  expectFailure,
  readFixtureFile,
  schemaFile,
} from './helpers.js';

const PATH = 'src/schemas/compiled.ts' as const;

/**
 * The `class … implements PvlSchema<Input, Output> {` head of every Compiled
 * Schema the run wrote for `source`, which spells the types it read.
 *
 * ```ts
 * await compileClassHeads("export const a = pvl.compile(pvl.array(pvl.literal('a')));")
 * // ['class PvlCompiledSchema0 implements PvlSchema<"a"[], "a"[]> {']
 * ```
 */
const compileClassHeads = async (source: string): Promise<string[]> => {
  const root = await createFixture({
    'pvlconfig.json': configJson({}),
    [PATH]: schemaFile(source),
  });
  const payload = await runCompilation({ cwd: root });
  expect(payload.diagnostics).toEqual([]);
  const mirrored = await readFixtureFile(root, '.pvl/schemas/compiled.ts');
  return [
    ...(mirrored ?? '').matchAll(/class PvlCompiledSchema\d+ implements PvlSchema<.*> \{$/gm),
  ].map(([classHead]) => classHead);
};

/** Asserts that compiling `source` fails with one `code` per entry, each on the compiled file. */
const expectCompileFailure = async (
  source: string,
  codes: ReadonlyArray<DiagnosticCode>,
): Promise<void> => {
  const root = await createFixture({
    'pvlconfig.json': configJson({}),
    [PATH]: schemaFile(source),
  });
  expectFailure(
    await runCompilation({ cwd: root }),
    codes.map((code) => ({ code, file: path.join(root, PATH) })),
  );
};

describe('StringSchema, NumberSchema, BooleanSchema and BigintSchema', () => {
  it('read a primitive factory, ignoring its arguments', async () => {
    expect(
      await compileClassHeads(
        "export const a = pvl.compile(pvl.object({ s: pvl.string(), n: pvl.number(), b: pvl.boolean(), g: pvl.bigint() }));\nexport const b = pvl.compile(pvl.array(pvl.string({ message: 'no' })));",
      ),
    ).toEqual([
      'class PvlCompiledSchema0 implements PvlSchema<{ s: string; n: number; b: boolean; g: bigint }, { s: string; n: number; b: boolean; g: bigint }> {',
      'class PvlCompiledSchema1 implements PvlSchema<string[], string[]> {',
    ]);
  });

  it('read a primitive factory pvl.compile() wraps itself', async () => {
    expect(
      await compileClassHeads(
        'export const a = pvl.compile(pvl.number());\nexport const b = pvl.compile(pvl.bigint().optional());',
      ),
    ).toEqual([
      'class PvlCompiledSchema0 implements PvlSchema<number, number> {',
      'class PvlCompiledSchema1 implements PvlSchema<bigint | undefined, bigint | undefined> {',
    ]);
  });
});

describe('LiteralSchema', () => {
  it('reads its value, through any number of consts, from a function that shadows none of them too', async () => {
    expect(
      await compileClassHeads(
        [
          "const KIND = 'user';",
          'const ALIAS = (KIND);',
          'export const a = pvl.compile(pvl.array(pvl.literal(KIND)));',
          'export const b = pvl.compile(pvl.array(pvl.literal(-1)));',
          'export const makeKinds = (kind: string) => pvl.compile(pvl.array(pvl.literal(ALIAS)));',
        ].join('\n'),
      ),
    ).toEqual([
      'class PvlCompiledSchema0 implements PvlSchema<"user"[], "user"[]> {',
      'class PvlCompiledSchema1 implements PvlSchema<-1[], -1[]> {',
      'class PvlCompiledSchema2 implements PvlSchema<"user"[], "user"[]> {',
    ]);
  });

  it('rejects an object or array argument, and a missing one', async () => {
    await expectCompileFailure(
      [
        'export const a = pvl.compile(pvl.array(pvl.literal({ a: 1 })));',
        'export const b = pvl.compile(pvl.array(pvl.literal([1])));',
        'export const c = pvl.compile(pvl.array(pvl.literal()));',
      ].join('\n'),
      Array.from({ length: 3 }, () => DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE),
    );
  });
});

describe('EnumSchema', () => {
  it('reads an array or an object of members, each once', async () => {
    expect(
      await compileClassHeads(
        "export const a = pvl.compile(pvl.array(pvl.enum(['A', 'B', 'A'])));\nexport const b = pvl.compile(pvl.array(pvl.enum({ A: 'a', B: 1, C: 'a' })));",
      ),
    ).toEqual([
      'class PvlCompiledSchema0 implements PvlSchema<("A" | "B")[], ("A" | "B")[]> {',
      'class PvlCompiledSchema1 implements PvlSchema<("a" | 1)[], ("a" | 1)[]> {',
    ]);
  });

  it('rejects no members, a member that is no string or number, and a non-object argument', async () => {
    await expectCompileFailure(
      [
        'export const a = pvl.compile(pvl.array(pvl.enum([])));',
        'export const b = pvl.compile(pvl.array(pvl.enum([true])));',
        "export const c = pvl.compile(pvl.array(pvl.enum('A')));",
      ].join('\n'),
      Array.from({ length: 3 }, () => DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE),
    );
  });
});

describe('ObjectSchema', () => {
  it('reads its fields in shape order, each through a const', async () => {
    expect(
      await compileClassHeads(
        'const name = pvl.string();\nconst shape = { name, tags: pvl.array(pvl.number()) };\nexport const a = pvl.compile(pvl.object(shape));',
      ),
    ).toEqual([
      'class PvlCompiledSchema0 implements PvlSchema<{ name: string; tags: number[] }, { name: string; tags: number[] }> {',
    ]);
  });

  it('rejects a field that is no Schema, and a missing shape', async () => {
    await expectCompileFailure(
      'export const a = pvl.compile(pvl.object({ name: 1 }));\nexport const b = pvl.compile(pvl.object());',
      [
        DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
        DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
      ],
    );
  });
});

describe('ArraySchema', () => {
  it('reads its element, through a const', async () => {
    expect(
      await compileClassHeads(
        'const element = pvl.array(pvl.boolean());\nexport const a = pvl.compile(pvl.array(element));',
      ),
    ).toEqual(['class PvlCompiledSchema0 implements PvlSchema<boolean[][], boolean[][]> {']);
  });

  it('rejects an element that is no Schema, and a missing one', async () => {
    await expectCompileFailure(
      "export const a = pvl.compile(pvl.array('a'));\nexport const b = pvl.compile(pvl.array());",
      [
        DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
        DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
      ],
    );
  });
});

describe('UnionSchema', () => {
  it('reads its members, yet reports UNSUPPORTED_SCHEMA wrapped and nested alike', async () => {
    await expectCompileFailure(
      [
        'export const a = pvl.compile(pvl.union([pvl.string(), pvl.number()]));',
        'export const b = pvl.compile(pvl.object({ id: pvl.union([pvl.string()]) }));',
      ].join('\n'),
      [DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA, DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA],
    );
  });

  it('rejects a member that is no Schema', async () => {
    await expectCompileFailure(
      'export const a = pvl.compile(pvl.object({ id: pvl.union([pvl.string(), 1]) }));',
      [DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE],
    );
  });
});
