import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Result } from '../src/index.js';
import { pvl } from '../src/index.js';
import { assertSuccess, issueCodes } from './helpers.js';

describe('pvl.bigint()', () => {
  it('accepts a bigint', () => {
    const result = pvl.bigint().validate(42n);
    assertSuccess(result);
    expect(result.value).toBe(42n);
  });

  it('rejects a non-bigint', () => {
    const result = pvl.bigint().validate(42);
    expect(result.issues).toBeDefined();
  });

  it('reports a top-level Issue with no path for a bare bigint failure', () => {
    const result = pvl.bigint().validate('x');
    expect(result.issues?.[0]?.message).toBeTypeOf('string');
    expect(result.issues?.[0]?.path).toBeUndefined();
  });

  describe('.min()', () => {
    it('accepts the exact min boundary', () => {
      const result = pvl.bigint().min(3n).validate(3n);
      expect(result.issues).toBeUndefined();
    });

    it('rejects one below the min boundary', () => {
      const result = pvl.bigint().min(3n).validate(2n);
      expect(result.issues).toBeDefined();
    });

    it('uses a custom message', () => {
      const result = pvl.bigint().min(3n, { message: 'too small' }).validate(2n);
      expect(result.issues?.[0]?.message).toBe('too small');
    });
  });

  describe('.max()', () => {
    it('accepts the exact max boundary', () => {
      const result = pvl.bigint().max(3n).validate(3n);
      expect(result.issues).toBeUndefined();
    });

    it('rejects one above the max boundary', () => {
      const result = pvl.bigint().max(3n).validate(4n);
      expect(result.issues).toBeDefined();
    });

    it('uses a custom message', () => {
      const result = pvl.bigint().max(3n, { message: 'too big' }).validate(4n);
      expect(result.issues?.[0]?.message).toBe('too big');
    });
  });

  describe('.refine()', () => {
    it('accepts a value satisfying the predicate', () => {
      const schema = pvl.bigint().refine((value) => value % 2n === 0n);
      expect(schema.validate(4n).issues).toBeUndefined();
    });

    it('rejects a value failing the predicate', () => {
      const schema = pvl.bigint().refine((value) => value % 2n === 0n);
      expect(schema.validate(3n).issues).toBeDefined();
    });

    it('uses a custom message', () => {
      const schema = pvl.bigint().refine((value) => value % 2n === 0n, {
        message: 'must be even',
      });
      expect(schema.validate(3n).issues?.[0]?.message).toBe('must be even');
    });

    it('never runs the predicate when the base check already failed', () => {
      const schema = pvl.bigint().refine(() => {
        throw new Error('should not be called');
      });
      expect(() => schema.validate('x')).not.toThrow();
    });

    it('collects a constraint chained after it alongside its own Issue, in chain order', () => {
      const schema = pvl
        .bigint()
        .refine((value) => value % 2n === 0n, { message: 'must be even' })
        .min(10n);
      expect(issueCodes(schema.validate(3n))).toEqual(['CUSTOM', 'TOO_SMALL']);
      expect(issueCodes(schema.validate(11n))).toEqual(['CUSTOM']);
      expect(issueCodes(schema.validate(4n))).toEqual(['TOO_SMALL']);
      expect(schema.validate(12n).issues).toBeUndefined();
    });
  });

  describe('.transform()', () => {
    it('converts the accepted value', () => {
      const schema = pvl.bigint().transform((value) => value.toString());
      const result = schema.validate(4n);
      assertSuccess(result);
      expect(result.value).toBe('4');
    });

    it('still rejects an invalid input without running the transform', () => {
      const schema = pvl.bigint().transform((value) => value.toString());
      const result = schema.validate('x');
      expect(result.issues).toBeDefined();
    });
  });

  describe('.coerce()', () => {
    it('coerces a string to a bigint before validating', () => {
      const result = pvl.bigint().coerce().validate('42');
      assertSuccess(result);
      expect(result.value).toBe(42n);
    });

    it('coerces an integer number to a bigint before validating', () => {
      const result = pvl.bigint().coerce().validate(42);
      assertSuccess(result);
      expect(result.value).toBe(42n);
    });

    it('still rejects a malformed string without throwing', () => {
      const result = pvl.bigint().coerce().validate('12.5');
      expect(result.issues).toBeDefined();
    });

    it('still rejects a non-integer number without throwing', () => {
      const result = pvl.bigint().coerce().validate(1.5);
      expect(result.issues).toBeDefined();
    });

    it('still coerces when chained after .refine()', () => {
      const result = pvl
        .bigint()
        .refine((value) => value > 0n)
        .coerce()
        .validate('42');
      assertSuccess(result);
      expect(result.value).toBe(42n);
    });
  });

  describe('.optional()', () => {
    it('accepts undefined', () => {
      const result = pvl.bigint().optional().validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
    });

    it('still validates a defined value', () => {
      const result = pvl.bigint().optional().validate('x');
      expect(result.issues).toBeDefined();
    });
  });

  describe('.nullable()', () => {
    it('accepts null', () => {
      const result = pvl.bigint().nullable().validate(null);
      assertSuccess(result);
      expect(result.value).toBeNull();
    });

    it('still validates a non-null value', () => {
      const result = pvl.bigint().nullable().validate('x');
      expect(result.issues).toBeDefined();
    });
  });

  describe('never throws for an invalid value', () => {
    it('returns a Result instead of throwing', () => {
      expect(() => pvl.bigint().min(3n).validate({ not: 'a bigint' })).not.toThrow();
    });

    it('never throws even when coercion input would make BigInt() throw', () => {
      expect(() => pvl.bigint().coerce().validate('not a bigint')).not.toThrow();
    });
  });
});

describe('pvl.bigint().min()/.max() (property-based)', () => {
  it('accepts any bigint within [min, max]', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 3n, max: 10n }), (value) => {
        const result = pvl.bigint().min(3n).max(10n).validate(value);
        return result.issues === undefined;
      }),
    );
  });

  it('rejects any bigint below min', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -10n, max: 2n }), (value) => {
        const result = pvl.bigint().min(3n).validate(value);
        return result.issues !== undefined;
      }),
    );
  });
});
