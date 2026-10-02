import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { pvl, VENDOR } from '../src/index.js';
import { assertSuccess } from './helpers.js';

// A Standard Schema that is not an `@pvl/schema` Schema, down to reporting
// this library's vendor and a coded, synchronous Result.
const foreignString: StandardSchemaV1<string> = {
  '~standard': {
    version: 1,
    vendor: VENDOR,
    validate: (value) =>
      typeof value === 'string'
        ? { value }
        : { issues: [{ code: 'INVALID_TYPE', message: 'Expected string' }] },
  },
};

// ADR-0018: a field, element or member is an `@pvl/schema` Schema, never a
// Standard Schema from elsewhere.
describe('composite children', () => {
  it('rejects a non-pvl Standard Schema as an object field', () => {
    // @ts-expect-error a field must be an `@pvl/schema` Schema
    pvl.object({ name: foreignString });
  });

  it('rejects a non-pvl Standard Schema as an array element', () => {
    // @ts-expect-error an element must be an `@pvl/schema` Schema
    pvl.array(foreignString);
  });

  it('rejects a non-pvl Standard Schema as a union member', () => {
    // @ts-expect-error a member must be an `@pvl/schema` Schema
    pvl.union([pvl.number(), foreignString]);
  });

  it('accepts a transformed Schema as a field, element and member', () => {
    const length = pvl.string().transform((value) => value.length);
    const schema = pvl.object({ name: length, tags: pvl.array(length), id: pvl.union([length]) });

    const result = schema.validate({ name: 'Ada', tags: ['a', 'bc'], id: 'x' });
    assertSuccess(result);
    expect(result.value).toEqual({ name: 3, tags: [1, 2], id: 1 });
    expectTypeOf(result.value).toEqualTypeOf<{ name: number; tags: number[]; id: number }>();
  });

  it('accepts a compiled Schema as a field, with its Issues pathed through the parent', () => {
    const address = pvl.compile(pvl.object({ city: pvl.string() }));
    const schema = pvl.object({ address, history: pvl.array(address) });

    expect(
      schema.validate({ address: { city: 1 }, history: [{ city: 'Prague' }, {}] }).issues,
    ).toEqual([
      { code: 'INVALID_TYPE', message: 'Expected string', path: ['address', 'city'] },
      { code: 'INVALID_TYPE', message: 'Expected string', path: ['history', 1, 'city'] },
    ]);
    expectTypeOf(schema.shape.address.shape.city.validate).toBeFunction();
  });
});
