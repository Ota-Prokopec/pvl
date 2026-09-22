import { describe, expect, it } from 'vitest';
import { pvl } from '../src/index.js';
import { assertSuccess } from './helpers.js';

describe('pvl.literal()', () => {
  it('accepts the exact string literal', () => {
    const result = pvl.literal('OWNER').validate('OWNER');
    assertSuccess(result);
    expect(result.value).toBe('OWNER');
  });

  it('rejects a different string', () => {
    const result = pvl.literal('OWNER').validate('MEMBER');
    expect(result.issues).toBeDefined();
  });

  it('accepts the exact number literal', () => {
    const result = pvl.literal(42).validate(42);
    assertSuccess(result);
    expect(result.value).toBe(42);
  });

  it('rejects a different number', () => {
    const result = pvl.literal(42).validate(43);
    expect(result.issues).toBeDefined();
  });

  it('accepts the exact boolean literal', () => {
    const result = pvl.literal(true).validate(true);
    assertSuccess(result);
    expect(result.value).toBe(true);
  });

  it('rejects the other boolean', () => {
    const result = pvl.literal(true).validate(false);
    expect(result.issues).toBeDefined();
  });

  it('accepts the exact bigint literal', () => {
    const result = pvl.literal(7n).validate(7n);
    assertSuccess(result);
    expect(result.value).toBe(7n);
  });

  it('rejects a value of a different type that is loosely equal', () => {
    const result = pvl.literal(42).validate('42');
    expect(result.issues).toBeDefined();
  });

  it('matches NaN against a NaN literal', () => {
    const result = pvl.literal(Number.NaN).validate(Number.NaN);
    assertSuccess(result);
    expect(result.value).toBeNaN();
  });

  it('rejects -0 against a literal 0 rather than normalizing it', () => {
    const result = pvl.literal(0).validate(-0);
    expect(result.issues).toBeDefined();
  });

  it('accepts 0 against a literal 0', () => {
    const result = pvl.literal(0).validate(0);
    assertSuccess(result);
    expect(Object.is(result.value, 0)).toBe(true);
  });

  it('rejects undefined when the schema is not optional', () => {
    const result = pvl.literal('OWNER').validate(undefined);
    expect(result.issues).toBeDefined();
  });

  it('uses a custom message for the literal check', () => {
    const result = pvl.literal('OWNER', { message: 'must be OWNER' }).validate('MEMBER');
    expect(result.issues?.[0]?.message).toBe('must be OWNER');
  });

  it('reports a top-level Issue with no path for a bare literal failure', () => {
    const result = pvl.literal('OWNER').validate('MEMBER');
    expect(result.issues?.[0]?.message).toBeTypeOf('string');
    expect(result.issues?.[0]?.code).toBe('INVALID_VALUE');
    expect(result.issues?.[0]?.path).toBeUndefined();
  });

  describe('inherited modifiers', () => {
    it('accepts undefined once .optional() is applied', () => {
      const result = pvl.literal('OWNER').optional().validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
    });

    it('accepts null once .nullable() is applied', () => {
      const result = pvl.literal('OWNER').nullable().validate(null);
      assertSuccess(result);
      expect(result.value).toBeNull();
    });

    it('runs a .refine() predicate after the literal check', () => {
      const schema = pvl.literal('OWNER').refine(() => false, {
        message: 'refused',
      });
      expect(schema.validate('OWNER').issues?.[0]?.message).toBe('refused');
    });

    it('applies a .transform() to the accepted literal', () => {
      const result = pvl
        .literal('OWNER')
        .transform((value) => value.toLowerCase())
        .validate('OWNER');
      assertSuccess(result);
      expect(result.value).toBe('owner');
    });

    it("coerces the input to the literal's own primitive type with .coerce()", () => {
      const result = pvl.literal(42).coerce().validate('42');
      assertSuccess(result);
      expect(result.value).toBe(42);
    });

    it('still rejects a coerced value that misses the literal', () => {
      const result = pvl.literal(42).coerce().validate('43');
      expect(result.issues).toBeDefined();
    });

    it('exposes Standard Schema conformance', () => {
      const schema = pvl.literal('OWNER');
      expect(schema['~standard'].version).toBe(1);
      expect(schema['~standard'].vendor).toBe('@pvl/schema');
      expect(schema['~standard'].validate('OWNER')).toEqual({
        value: 'OWNER',
      });
    });
  });
});
