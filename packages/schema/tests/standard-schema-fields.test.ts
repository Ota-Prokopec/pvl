import { describe, expect, expectTypeOf, it } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { ISSUE_CODE, pvl, VENDOR, type PvlStandardSchema, type Result } from '../src/index.js';
import { assertSuccess } from './helpers.js';

// Builds a stand-in for a Compiled Schema: a plain Standard Schema object
// reporting `@pvl/schema`'s vendor, with no place in the package's `Schema`
// class hierarchy and so no `_validate` for a composite to reach for.
const compiledStandIn = <Input, Output = Input>(
  validate: (value: unknown) => Result<Output>,
): PvlStandardSchema<Input, Output> => ({
  '~standard': { version: 1, vendor: VENDOR, validate },
});

const compiledString = compiledStandIn<string>((value) =>
  typeof value === 'string'
    ? { value }
    : { issues: [{ code: ISSUE_CODE.INVALID_TYPE, message: 'Expected string' }] },
);

// A stand-in Compiled Schema for `{ city: string }`, reporting its own
// nested failure relative to itself — the way a compiled object does, since it
// cannot know where a parent will place it.
const compiledAddress = compiledStandIn<{ city: string }>((value) => {
  if (typeof value !== 'object' || value === null) {
    return { issues: [{ code: ISSUE_CODE.INVALID_TYPE, message: 'Expected object' }] };
  }
  const city = 'city' in value ? value.city : undefined;
  return typeof city === 'string'
    ? { value: { city } }
    : { issues: [{ code: ISSUE_CODE.INVALID_TYPE, message: 'Expected string', path: ['city'] }] };
});

describe('a pvl Standard Schema as a composite field', () => {
  it('validates an object field through its Standard Schema entry point', () => {
    const schema = pvl.object({ name: compiledString, age: pvl.number() });
    const result = schema.validate({ name: 'Ada', age: 36 });
    assertSuccess(result);
    expect(result.value).toEqual({ name: 'Ada', age: 36 });
  });

  it("prefixes the field's key onto an Issue the field reports at its own root", () => {
    const schema = pvl.object({ name: compiledString });
    expect(schema.validate({ name: 42 }).issues).toEqual([
      { code: ISSUE_CODE.INVALID_TYPE, message: 'Expected string', path: ['name'] },
    ]);
  });

  it('reports a failure two levels down with its full path from the outermost Schema', () => {
    const schema = pvl.object({ user: pvl.object({ address: compiledAddress }) });
    expect(schema.validate({ user: { address: { city: 7 } } }).issues).toEqual([
      {
        code: ISSUE_CODE.INVALID_TYPE,
        message: 'Expected string',
        path: ['user', 'address', 'city'],
      },
    ]);
  });

  it('collects every failing field, interpreted and Standard Schema alike', () => {
    const schema = pvl.object({
      name: compiledString,
      age: pvl.number(),
      address: compiledAddress,
    });
    const result = schema.validate({ name: 1, age: 'old', address: { city: null } });
    expect(result.issues?.map((issue) => issue.path)).toEqual([
      ['name'],
      ['age'],
      ['address', 'city'],
    ]);
  });

  it("returns the field's own output, leaving an omitted optional field omitted", () => {
    const compiledNickname = compiledStandIn<string | undefined, number | undefined>((value) =>
      value === undefined || typeof value === 'string'
        ? { value: value?.length }
        : { issues: [{ code: ISSUE_CODE.INVALID_TYPE, message: 'Expected string' }] },
    );
    const schema = pvl.object({ name: pvl.string(), nickname: compiledNickname });

    const omitted = schema.validate({ name: 'Ada' });
    assertSuccess(omitted);
    expect(omitted.value).toStrictEqual({ name: 'Ada' });

    const present = schema.validate({ name: 'Ada', nickname: 'Addie' });
    assertSuccess(present);
    expect(present.value).toEqual({ name: 'Ada', nickname: 5 });
  });

  it('validates every array element through its Standard Schema entry point', () => {
    const result = pvl.array(compiledString).validate(['a', 'b']);
    assertSuccess(result);
    expect(result.value).toEqual(['a', 'b']);
  });

  it('prefixes the index onto every failing element, collecting them all', () => {
    const schema = pvl.object({ addresses: pvl.array(compiledAddress) });
    expect(
      schema.validate({ addresses: [{ city: 1 }, { city: 'London' }, 'nope'] }).issues,
    ).toEqual([
      { code: ISSUE_CODE.INVALID_TYPE, message: 'Expected string', path: ['addresses', 0, 'city'] },
      { code: ISSUE_CODE.INVALID_TYPE, message: 'Expected object', path: ['addresses', 2] },
    ]);
  });
});

// The same structural shape as a pvl Standard Schema, reporting another
// library's vendor — what a Zod or Valibot schema looks like to the compiler.
const foreignString: StandardSchemaV1<string> = {
  '~standard': {
    version: 1,
    vendor: 'zod',
    validate: (value) =>
      typeof value === 'string' ? { value } : { issues: [{ message: 'Expected string' }] },
  },
};

describe('pvl Standard Schema fields (types)', () => {
  it("types every schema's vendor as the literal '@pvl/schema'", () => {
    expectTypeOf(pvl.string()['~standard'].vendor).toEqualTypeOf<'@pvl/schema'>();
    expectTypeOf(
      pvl.object({ id: pvl.number() }).optional()['~standard'].vendor,
    ).toEqualTypeOf<'@pvl/schema'>();
    expectTypeOf(
      pvl.union([pvl.literal('a'), pvl.bigint()]).transform(String)['~standard'].vendor,
    ).toEqualTypeOf<'@pvl/schema'>();
  });

  it('infers an object through a Standard Schema field, keeping an optional key optional', () => {
    const compiledNickname = {} as PvlStandardSchema<string | undefined, number | undefined>;
    const schema = pvl.object({
      address: compiledAddress,
      nickname: compiledNickname,
    });
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<{
      address: { city: string };
      nickname?: string | undefined;
    }>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      address: { city: string };
      nickname?: number | undefined;
    }>();
    expectTypeOf(schema.shape.address).toEqualTypeOf<PvlStandardSchema<{ city: string }>>();
  });

  it('infers an array through a Standard Schema element', () => {
    const schema = pvl.array(compiledAddress);
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{ city: string }[]>();
    expectTypeOf(schema.element).toEqualTypeOf<PvlStandardSchema<{ city: string }>>();
  });

  it('rejects a Standard Schema from another library as a field or element', () => {
    // @ts-expect-error a field must report the '@pvl/schema' vendor
    pvl.object({ name: foreignString });
    // @ts-expect-error an element must report the '@pvl/schema' vendor
    pvl.array(foreignString);
  });

  it('rejects a field that differs from a pvl Standard Schema only by its vendor', () => {
    const relabelled = { '~standard': { ...compiledString['~standard'], vendor: 'valibot' } };
    // @ts-expect-error the vendor alone disqualifies it
    pvl.object({ name: relabelled });
  });
});
