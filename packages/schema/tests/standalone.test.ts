// `.standalone()` and the Standalone Key: what the marker does to a Schema,
// and which keys an object's `shape` holds (standalone-keys.md).
import { describe, expect, expectTypeOf, it } from 'vitest';
import { pvl, type Schema, type StandaloneMarker } from '../src/index.js';
import { issueCodes } from './helpers.js';

describe('.standalone()', () => {
  it('validates exactly as the Schema it marks', () => {
    const marked = pvl.string().min(3).standalone();

    expect(marked.validate('abc')).toStrictEqual({ value: 'abc' });
    expect(issueCodes(marked.validate('ab'))).toStrictEqual(['TOO_SMALL']);
    expect(issueCodes(marked.validate(1))).toStrictEqual(['INVALID_TYPE']);
  });

  it('ends the chain: no Modifier, Constraint or structural method follows it', () => {
    const marked = pvl.string().min(3).standalone();
    expectTypeOf(marked).toEqualTypeOf<Schema<string, string> & StandaloneMarker>();
    // @ts-expect-error `.standalone()` ends the chain
    marked.min(1);
    // @ts-expect-error `.standalone()` ends the chain
    marked.optional();
    // @ts-expect-error `.standalone()` ends the chain
    pvl.object({}).standalone().strict();
    // @ts-expect-error `.standalone()` ends the chain
    pvl.array(pvl.string()).standalone().max(1);
  });

  it('is callable twice, and on the plain Schema .transform() returns', () => {
    const twice = pvl.number().standalone().standalone();
    const transformed = pvl
      .string()
      .transform((value) => value.length)
      .standalone();

    expectTypeOf(twice).toEqualTypeOf<Schema<number, number> & StandaloneMarker>();
    expectTypeOf(transformed).toEqualTypeOf<Schema<string, number> & StandaloneMarker>();
    expect(twice.validate(1)).toStrictEqual({ value: 1 });
    expect(transformed.validate('abc')).toStrictEqual({ value: 3 });
  });

  it('changes neither what an object accepts nor the Issues it reports', () => {
    const marked = pvl.object({
      name: pvl.string().min(2).standalone(),
      age: pvl.number().int(),
    });
    const unmarked = pvl.object({ name: pvl.string().min(2), age: pvl.number().int() });

    for (const value of [{ name: 'Ada', age: 36 }, { name: 'A', age: 1.5 }, { extra: 1 }, 'x']) {
      expect(marked.validate(value)).toStrictEqual(unmarked.validate(value));
    }
  });
});
