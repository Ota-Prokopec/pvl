import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Result } from '../src/index.js';
import { pvl } from '../src/index.js';
import { assertSuccess } from './helpers.js';

describe('pvl.string()', () => {
  it('accepts a string', () => {
    const result = pvl.string().validate('hello');
    assertSuccess(result);
    expect(result.value).toBe('hello');
  });

  it('rejects a non-string', () => {
    const result = pvl.string().validate(42);
    expect(result.issues).toBeDefined();
  });

  it('uses a custom message for the base type check', () => {
    const result = pvl.string({ message: 'must be a string' }).validate(42);
    expect(result.issues?.[0]?.message).toBe('must be a string');
  });

  it('reports a top-level Issue with no path for a bare string failure', () => {
    const result = pvl.string().validate(42);
    expect(result.issues?.[0]?.message).toBeTypeOf('string');
    expect(result.issues?.[0]?.path).toBeUndefined();
  });

  describe('.min()', () => {
    it('accepts the exact min boundary', () => {
      const result = pvl.string().min(3).validate('abc');
      expect(result.issues).toBeUndefined();
    });

    it('rejects one below the min boundary', () => {
      const result = pvl.string().min(3).validate('ab');
      expect(result.issues).toBeDefined();
    });

    it('uses a custom message', () => {
      const result = pvl.string().min(3, { message: 'too short' }).validate('ab');
      expect(result.issues?.[0]?.message).toBe('too short');
    });
  });

  describe('.max()', () => {
    it('accepts the exact max boundary', () => {
      const result = pvl.string().max(3).validate('abc');
      expect(result.issues).toBeUndefined();
    });

    it('rejects one above the max boundary', () => {
      const result = pvl.string().max(3).validate('abcd');
      expect(result.issues).toBeDefined();
    });

    it('uses a custom message', () => {
      const result = pvl.string().max(3, { message: 'too long' }).validate('abcd');
      expect(result.issues?.[0]?.message).toBe('too long');
    });
  });

  describe('.length()', () => {
    it('accepts the exact length', () => {
      const result = pvl.string().length(3).validate('abc');
      expect(result.issues).toBeUndefined();
    });

    it('rejects a different length', () => {
      const result = pvl.string().length(3).validate('ab');
      expect(result.issues).toBeDefined();
    });

    it('uses a custom message', () => {
      const result = pvl.string().length(3, { message: 'wrong length' }).validate('ab');
      expect(result.issues?.[0]?.message).toBe('wrong length');
    });
  });

  describe('.refine()', () => {
    it('accepts a value satisfying the predicate', () => {
      const schema = pvl.string().refine((value) => value.startsWith('a'));
      expect(schema.validate('abc').issues).toBeUndefined();
    });

    it('rejects a value failing the predicate', () => {
      const schema = pvl.string().refine((value) => value.startsWith('a'));
      expect(schema.validate('bcd').issues).toBeDefined();
    });

    it('uses a custom message', () => {
      const schema = pvl.string().refine((value) => value.startsWith('a'), {
        message: 'must start with a',
      });
      expect(schema.validate('bcd').issues?.[0]?.message).toBe('must start with a');
    });

    it('never runs the predicate when the base check already failed', () => {
      const schema = pvl.string().refine(() => {
        throw new Error('should not be called');
      });
      expect(() => schema.validate(42)).not.toThrow();
    });

    it('survives a constraint chained after it', () => {
      const schema = pvl
        .string()
        .refine((value) => value !== 'root', { message: 'reserved name' })
        .max(10);
      expect(schema.validate('root').issues?.[0]?.message).toBe('reserved name');
      expect(schema.validate('x'.repeat(11)).issues?.[0]?.code).toBe('TOO_BIG');
      expect(schema.validate('ada').issues).toBeUndefined();
    });
  });

  describe('.transform()', () => {
    it('converts the accepted value', () => {
      const schema = pvl.string().transform((value) => value.length);
      const result = schema.validate('abcd');
      assertSuccess(result);
      expect(result.value).toBe(4);
    });

    it('still rejects an invalid input without running the transform', () => {
      const schema = pvl.string().transform((value) => value.length);
      const result = schema.validate(42);
      expect(result.issues).toBeDefined();
    });
  });

  describe('.coerce()', () => {
    it('coerces a number to a string before validating', () => {
      const result = pvl.string().coerce().validate(42);
      assertSuccess(result);
      expect(result.value).toBe('42');
    });

    it('coerces a boolean to a string before validating', () => {
      const result = pvl.string().coerce().validate(true);
      assertSuccess(result);
      expect(result.value).toBe('true');
    });

    it("still rejects a value that can't become a valid string", () => {
      const result = pvl.string().min(3).coerce().validate(4);
      expect(result.issues).toBeDefined();
    });

    it('still coerces when chained after .refine()', () => {
      const result = pvl
        .string()
        .refine((value) => value.length > 0)
        .coerce()
        .validate(42);
      assertSuccess(result);
      expect(result.value).toBe('42');
    });

    it('still coerces when chained after .transform()', () => {
      const result = pvl
        .string()
        .transform((value) => value.length)
        .coerce()
        .validate(true);
      assertSuccess(result);
      expect(result.value).toBe(4);
    });
  });

  describe('.optional()', () => {
    it('accepts undefined', () => {
      const result = pvl.string().optional().validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
    });

    it('still validates a defined value', () => {
      const result = pvl.string().optional().validate(42);
      expect(result.issues).toBeDefined();
    });
  });

  describe('.nullable()', () => {
    it('accepts null', () => {
      const result = pvl.string().nullable().validate(null);
      assertSuccess(result);
      expect(result.value).toBeNull();
    });

    it('still validates a non-null value', () => {
      const result = pvl.string().nullable().validate(42);
      expect(result.issues).toBeDefined();
    });
  });

  describe('interleaved .refine()/.transform() ordering', () => {
    it('applies steps in exact call order, not refinements-then-transforms', () => {
      const schema = pvl
        .string()
        .refine((value) => value.startsWith('a'))
        .transform((value) => value.toUpperCase())
        .refine((value) => value === value.toUpperCase());
      const result = schema.validate('abc');
      assertSuccess(result);
      expect(result.value).toBe('ABC');
    });

    it('fails the final refinement when it observes the post-transform value', () => {
      const schema = pvl
        .string()
        .refine((value) => value.startsWith('a'))
        .transform((value) => value.toUpperCase())
        .refine((value) => value.startsWith('a'));
      const result = schema.validate('abc');
      expect(result.issues).toBeDefined();
    });
  });

  describe('.optional()/.nullable() short-circuit ordering', () => {
    it('short-circuits on undefined before the base type check runs', () => {
      const schema = pvl.string().optional();
      const result = schema.validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
    });

    it('short-circuits on undefined before any .refine()/.transform() step runs', () => {
      const schema = pvl
        .string()
        .refine(() => {
          throw new Error('refine should not run for undefined');
        })
        .transform(() => {
          throw new Error('transform should not run for undefined');
        })
        .optional();
      const result = schema.validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
    });

    it('short-circuits on null before the base type check runs', () => {
      const schema = pvl.string().nullable();
      const result = schema.validate(null);
      assertSuccess(result);
      expect(result.value).toBeNull();
    });

    it('short-circuits on null before any .refine()/.transform() step runs', () => {
      const schema = pvl
        .string()
        .refine(() => {
          throw new Error('refine should not run for null');
        })
        .transform(() => {
          throw new Error('transform should not run for null');
        })
        .nullable();
      const result = schema.validate(null);
      assertSuccess(result);
      expect(result.value).toBeNull();
    });
  });

  describe('never throws for an invalid value', () => {
    it('returns a Result instead of throwing', () => {
      expect(() => pvl.string().min(3).validate({ not: 'a string' })).not.toThrow();
    });
  });
});

describe('pvl.string().min()/.max() (property-based)', () => {
  it('accepts any string within [min, max] length', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 3, maxLength: 10 }), (value) => {
        const result = pvl.string().min(3).max(10).validate(value);
        return result.issues === undefined;
      }),
    );
  });

  it('rejects any string shorter than min', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 2 }), (value) => {
        const result = pvl.string().min(3).validate(value);
        return result.issues !== undefined;
      }),
    );
  });
});
