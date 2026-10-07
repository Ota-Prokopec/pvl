import { describe, expect, it } from 'vitest';
import { pvl } from '../src/index.js';
import { assertSuccess } from './helpers.js';

describe('pvl.boolean()', () => {
  it('accepts true', () => {
    const result = pvl.boolean().validate(true);
    assertSuccess(result);
    expect(result.value).toBe(true);
  });

  it('accepts false', () => {
    const result = pvl.boolean().validate(false);
    assertSuccess(result);
    expect(result.value).toBe(false);
  });

  it('rejects a non-boolean', () => {
    const result = pvl.boolean().validate('true');
    expect(result.issues).toBeDefined();
  });

  it('reports a top-level Issue with no path for a bare boolean failure', () => {
    const result = pvl.boolean().validate('x');
    expect(result.issues?.[0]?.message).toBeTypeOf('string');
    expect(result.issues?.[0]?.path).toBeUndefined();
  });

  describe('.refine()', () => {
    it('accepts a value satisfying the predicate', () => {
      const schema = pvl.boolean().refine((value) => value === true);
      expect(schema.validate(true).issues).toBeUndefined();
    });

    it('rejects a value failing the predicate', () => {
      const schema = pvl.boolean().refine((value) => value === true);
      expect(schema.validate(false).issues).toBeDefined();
    });

    it('uses a custom message', () => {
      const schema = pvl.boolean().refine((value) => value === true, {
        message: 'must be true',
      });
      expect(schema.validate(false).issues?.[0]?.message).toBe('must be true');
    });

    it('never runs the predicate when the base check already failed', () => {
      const schema = pvl.boolean().refine(() => {
        throw new Error('should not be called');
      });
      expect(() => schema.validate('x')).not.toThrow();
    });
  });

  describe('.transform()', () => {
    it('converts the accepted value', () => {
      const schema = pvl.boolean().transform((value) => (value ? 1 : 0));
      const result = schema.validate(true);
      assertSuccess(result);
      expect(result.value).toBe(1);
    });

    it('still rejects an invalid input without running the transform', () => {
      const schema = pvl.boolean().transform((value) => (value ? 1 : 0));
      const result = schema.validate('x');
      expect(result.issues).toBeDefined();
    });
  });

  describe('.coerce()', () => {
    it('coerces a truthy string to true before validating', () => {
      const result = pvl.boolean().coerce().validate('hello');
      assertSuccess(result);
      expect(result.value).toBe(true);
    });

    it('coerces an empty string to false before validating', () => {
      const result = pvl.boolean().coerce().validate('');
      assertSuccess(result);
      expect(result.value).toBe(false);
    });

    it('coerces a number to a boolean before validating', () => {
      const result = pvl.boolean().coerce().validate(0);
      assertSuccess(result);
      expect(result.value).toBe(false);
    });

    it('still coerces when chained after .refine()', () => {
      const result = pvl
        .boolean()
        .refine((value) => typeof value === 'boolean')
        .coerce()
        .validate(1);
      assertSuccess(result);
      expect(result.value).toBe(true);
    });
  });

  describe('.optional()', () => {
    it('accepts undefined', () => {
      const result = pvl.boolean().optional().validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
    });

    it('still validates a defined value', () => {
      const result = pvl.boolean().optional().validate('x');
      expect(result.issues).toBeDefined();
    });
  });

  describe('.nullable()', () => {
    it('accepts null', () => {
      const result = pvl.boolean().nullable().validate(null);
      assertSuccess(result);
      expect(result.value).toBeNull();
    });

    it('still validates a non-null value', () => {
      const result = pvl.boolean().nullable().validate('x');
      expect(result.issues).toBeDefined();
    });
  });

  describe('never throws for an invalid value', () => {
    it('returns a Result instead of throwing', () => {
      expect(() => pvl.boolean().validate({ not: 'a boolean' })).not.toThrow();
    });
  });
});
