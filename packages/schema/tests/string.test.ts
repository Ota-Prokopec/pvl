import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { pvl } from '../src/index.js';
import { assertSuccess, issueCodes } from './helpers.js';

// A refinement the test expects never to run.
const throwing = (): boolean => {
  throw new Error('refine should not run');
};

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

    it('collects a constraint chained after it alongside its own Issue, in chain order', () => {
      const schema = pvl
        .string()
        .refine((value) => value !== 'root', { message: 'reserved name' })
        .max(3);
      expect(issueCodes(schema.validate('root'))).toEqual(['CUSTOM', 'TOO_BIG']);
      expect(issueCodes(schema.validate('abcd'))).toEqual(['TOO_BIG']);
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

    it('coerces any other input through String(), undefined and null included', () => {
      expect(pvl.string().coerce().validate(undefined)).toEqual({ value: 'undefined' });
      expect(pvl.string().coerce().validate(null)).toEqual({ value: 'null' });
      expect(pvl.string().coerce().validate({})).toEqual({ value: '[object Object]' });
    });

    it('leaves undefined alone when .optional() is chained before .coerce()', () => {
      expect(pvl.string().optional().coerce().validate(undefined)).toEqual({ value: undefined });
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

  describe('.refine() before .transform()', () => {
    it('runs a .refine() chained before .transform() on the untransformed value', () => {
      const schema = pvl
        .string()
        .refine((value) => value.startsWith('a'))
        .transform((value) => value.toUpperCase());
      const result = schema.validate('abc');
      assertSuccess(result);
      expect(result.value).toBe('ABC');
    });

    it('skips the .transform() once a .refine() chained before it has failed', () => {
      const schema = pvl
        .string()
        .refine((value) => value.startsWith('a'))
        .transform(() => {
          throw new Error('transform should not run after a failed refinement');
        });
      expect(issueCodes(schema.validate('bcd'))).toEqual(['CUSTOM']);
    });
  });

  describe('.optional()/.nullable() short-circuit ordering', () => {
    it('short-circuits on undefined before the base type check runs', () => {
      const schema = pvl.string().optional();
      const result = schema.validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
    });

    it('skips a .refine() for undefined, wherever .optional() is chained', () => {
      for (const schema of [
        pvl.string().optional().refine(throwing),
        pvl.string().refine(throwing).optional(),
      ]) {
        const result = schema.validate(undefined);
        assertSuccess(result);
        expect(result.value).toBeUndefined();
      }
    });

    it('short-circuits on null before the base type check runs', () => {
      const schema = pvl.string().nullable();
      const result = schema.validate(null);
      assertSuccess(result);
      expect(result.value).toBeNull();
    });

    it('skips a .refine() for null, wherever .nullable() is chained', () => {
      for (const schema of [
        pvl.string().nullable().refine(throwing),
        pvl.string().refine(throwing).nullable(),
      ]) {
        const result = schema.validate(null);
        assertSuccess(result);
        expect(result.value).toBeNull();
      }
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
