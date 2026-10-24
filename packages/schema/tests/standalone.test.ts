// `.standalone()` and the Standalone Key: what the marker does to a Schema,
// and which keys an object's `shape` holds (standalone-keys.md).
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  pvl,
  type NumberInterpretedSchema,
  type Schema,
  type StandaloneMarker,
  type StringInterpretedSchema,
} from '../src/index.js';
import { issueCodes } from './helpers.js';

describe('.standalone()', () => {
  it('validates exactly as the Schema it marks', () => {
    const marked = pvl.string().min(3).standalone();

    expect(marked.validate('abc')).toStrictEqual({ value: 'abc' });
    expect(issueCodes(marked.validate('ab'))).toStrictEqual(['TOO_SMALL']);
    expect(issueCodes(marked.validate(1))).toStrictEqual(['INVALID_TYPE']);
  });

  it('keeps the chain going: the Schema comes back as its own class, marked', () => {
    const marked = pvl.string().standalone();
    expectTypeOf(marked).toEqualTypeOf<StringInterpretedSchema & StandaloneMarker>();
    expectTypeOf(marked.min(3)).toEqualTypeOf<StringInterpretedSchema & StandaloneMarker>();
    expectTypeOf(pvl.object({}).standalone().strict()).toExtend<StandaloneMarker>();
    expectTypeOf(pvl.array(pvl.string()).standalone().max(1)).toExtend<StandaloneMarker>();
  });

  it('stays marked through every Modifier that follows it, .transform() included', () => {
    const marked = pvl.string().standalone();
    expectTypeOf(marked.optional()).toEqualTypeOf<
      StringInterpretedSchema<string | undefined, string | undefined> & StandaloneMarker
    >();
    expectTypeOf(
      marked
        .nullable()
        .coerce()
        .refine(() => true),
    ).toExtend<StandaloneMarker>();
    expectTypeOf(marked.transform((value) => value.length)).toEqualTypeOf<
      Schema<string, number> & StandaloneMarker
    >();
    expectTypeOf(pvl.string().optional()).not.toExtend<StandaloneMarker>();
    expectTypeOf(pvl.string().transform((value) => value.length)).toEqualTypeOf<
      Schema<string, number>
    >();
  });

  it('validates as the Schema it marks wherever it is chained, and the Modifiers after it run', () => {
    const marked = pvl.string().standalone().min(3).optional();

    expect(marked.validate('abc')).toStrictEqual({ value: 'abc' });
    expect(marked.validate(undefined)).toStrictEqual({ value: undefined });
    expect(issueCodes(marked.validate('ab'))).toStrictEqual(['TOO_SMALL']);
    expect(marked._standalone).toBe(true);
    expect(
      pvl
        .string()
        .standalone()
        .transform((value) => value.length)._standalone,
    ).toBe(true);
  });

  it('is callable twice, and on the plain Schema .transform() returns', () => {
    const twice = pvl.number().standalone().standalone();
    const transformed = pvl
      .string()
      .transform((value) => value.length)
      .standalone();

    expectTypeOf(twice).toEqualTypeOf<NumberInterpretedSchema & StandaloneMarker>();
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
