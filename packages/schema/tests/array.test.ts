import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { pvl, type Issue } from '../src/index.js';
import { assertSuccess, issueCodes } from './helpers.js';

describe('pvl.array()', () => {
  it('accepts an array whose every element matches the item schema', () => {
    const schema = pvl.array(pvl.string());
    const result = schema.validate(['a', 'b', 'c']);
    assertSuccess(result);
    expect(result.value).toEqual(['a', 'b', 'c']);
  });

  it('accepts an empty array', () => {
    const result = pvl.array(pvl.string()).validate([]);
    assertSuccess(result);
    expect(result.value).toEqual([]);
  });

  it('rejects an array with a failing element', () => {
    const schema = pvl.array(pvl.string());
    const result = schema.validate(['a', 42, 'c']);
    expect(result.issues).toBeDefined();
  });

  it('rejects a non-array', () => {
    const schema = pvl.array(pvl.string());
    expect(schema.validate('nope').issues).toBeDefined();
    expect(schema.validate(42).issues).toBeDefined();
    expect(schema.validate(undefined).issues).toBeDefined();
  });

  it('rejects null', () => {
    const result = pvl.array(pvl.string()).validate(null);
    expect(result.issues).toBeDefined();
  });

  it('rejects a plain object', () => {
    const result = pvl.array(pvl.string()).validate({ 0: 'a', length: 1 });
    expect(result.issues).toBeDefined();
  });

  it('reports one issue per failing element rather than stopping at the first', () => {
    const schema = pvl.array(pvl.string());
    const result = schema.validate([1, 'ok', 2]);
    expect(result.issues).toHaveLength(2);
  });

  describe('.min()/.max()/.length()', () => {
    it('accepts the exact min boundary', () => {
      const result = pvl.array(pvl.string()).min(2).validate(['a', 'b']);
      expect(result.issues).toBeUndefined();
    });

    it('rejects one below the min boundary', () => {
      const result = pvl.array(pvl.string()).min(2).validate(['a']);
      expect(result.issues).toBeDefined();
    });

    it('accepts the exact max boundary', () => {
      const result = pvl.array(pvl.string()).max(2).validate(['a', 'b']);
      expect(result.issues).toBeUndefined();
    });

    it('rejects one above the max boundary', () => {
      const result = pvl.array(pvl.string()).max(2).validate(['a', 'b', 'c']);
      expect(result.issues).toBeDefined();
    });

    it('accepts an array matching .length() exactly', () => {
      const result = pvl.array(pvl.string()).length(2).validate(['a', 'b']);
      expect(result.issues).toBeUndefined();
    });

    it('rejects an array not matching .length()', () => {
      const result = pvl.array(pvl.string()).length(2).validate(['a']);
      expect(result.issues).toBeDefined();
    });

    it('uses a custom message for a failing .min()', () => {
      const schema = pvl.array(pvl.string()).min(2, { message: 'too few items' });
      const result = schema.validate(['a']);
      expect(result.issues?.[0]?.message).toBe('too few items');
    });

    it('runs no length check once an element has failed', () => {
      const schema = pvl.array(pvl.string()).length(2);
      const result = schema.validate([42]);
      expect(result.issues?.map((issue: Issue) => [issue.path, issue.code])).toEqual([
        [[0], 'INVALID_TYPE'],
      ]);
    });

    it('runs the length check once every element passed', () => {
      const result = pvl.array(pvl.string()).length(2).validate(['a']);
      expect(issueCodes(result)).toEqual(['INVALID_LENGTH']);
    });
  });

  describe('inherited base modifiers', () => {
    it('accepts undefined once .optional()', () => {
      const schema = pvl.array(pvl.string()).optional();
      const result = schema.validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
    });

    it('accepts null once .nullable()', () => {
      const schema = pvl.array(pvl.string()).nullable();
      const result = schema.validate(null);
      assertSuccess(result);
      expect(result.value).toBeNull();
    });

    it("rejects an array failing the schema's own .refine()", () => {
      const schema = pvl
        .array(pvl.number())
        .refine((value) => value.length % 2 === 0, { message: 'must have an even count' });
      expect(schema.validate([1, 2]).issues).toBeUndefined();
      expect(schema.validate([1, 2, 3]).issues?.[0]?.message).toBe('must have an even count');
    });

    it("applies the schema's own .transform()", () => {
      const schema = pvl.array(pvl.number()).transform((value) => value.length);
      const result = schema.validate([1, 2, 3]);
      assertSuccess(result);
      expect(result.value).toBe(3);
    });

    it('leaves the value unchanged once .coerce(), having no array-specific conversion', () => {
      const schema = pvl.array(pvl.string()).coerce();
      const accepted = schema.validate(['a']);
      assertSuccess(accepted);
      expect(accepted.value).toEqual(['a']);
      expect(schema.validate('["a"]').issues).toBeDefined();
    });

    it('keeps .optional() through a constraint chained after it', () => {
      const schema = pvl.array(pvl.string()).optional().min(1);
      const result = schema.validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
      expect(schema.validate([]).issues?.[0]?.code).toBe('TOO_SMALL');
    });

    it('collects .refine() and a constraint chained after it, in chain order', () => {
      const schema = pvl
        .array(pvl.string())
        .refine((value) => value.length % 2 === 0, { message: 'must have an even count' })
        .max(4);
      expect(schema.validate(['a']).issues?.map((issue) => issue.message)).toEqual([
        'must have an even count',
      ]);
      expect(issueCodes(schema.validate(['a', 'b', 'c', 'd', 'e']))).toEqual(['CUSTOM', 'TOO_BIG']);
      expect(schema.validate(['a', 'b']).issues).toBeUndefined();
    });

    it('exposes Standard Schema conformance', () => {
      const schema = pvl.array(pvl.string());
      expect(schema['~standard'].version).toBe(1);
      expect(schema['~standard'].vendor).toBe('@pvl/schema');
      expect(schema['~standard'].validate(['a'])).toEqual({ value: ['a'] });
    });
  });

  describe('element-level modifiers', () => {
    it('accepts a missing-turned-optional element via .optional()', () => {
      const schema = pvl.array(pvl.string().optional());
      const result = schema.validate(['a', undefined, 'c']);
      assertSuccess(result);
      expect(result.value).toEqual(['a', undefined, 'c']);
    });

    it("applies an element's .transform() to the output", () => {
      const schema = pvl.array(pvl.string().transform((value) => value.length));
      const result = schema.validate(['a', 'bb']);
      assertSuccess(result);
      expect(result.value).toEqual([1, 2]);
    });

    it("applies an element's .coerce() before its own check", () => {
      const schema = pvl.array(pvl.number().coerce());
      const result = schema.validate(['1', '2']);
      assertSuccess(result);
      expect(result.value).toEqual([1, 2]);
    });
  });

  describe('nested object/array combinations', () => {
    it('accepts an array of objects', () => {
      const schema = pvl.array(pvl.object({ name: pvl.string() }));
      const result = schema.validate([{ name: 'ada' }, { name: 'grace' }]);
      assertSuccess(result);
      expect(result.value).toEqual([{ name: 'ada' }, { name: 'grace' }]);
    });

    it('accepts an object with an array field', () => {
      const schema = pvl.object({ tags: pvl.array(pvl.string()) });
      const result = schema.validate({ tags: ['a', 'b'] });
      assertSuccess(result);
      expect(result.value).toEqual({ tags: ['a', 'b'] });
    });

    it('accepts an array of arrays', () => {
      const schema = pvl.array(pvl.array(pvl.number()));
      const result = schema.validate([
        [1, 2],
        [3, 4],
      ]);
      assertSuccess(result);
      expect(result.value).toEqual([
        [1, 2],
        [3, 4],
      ]);
    });
  });

  describe('element', () => {
    it('exposes the item schema instance it was built with', () => {
      const item = pvl.string();
      expect(pvl.array(item).element).toBe(item);
    });

    it('validates one item on its own, accepting a valid value', () => {
      const schema = pvl.array(pvl.string().min(2));
      const result = schema.element.validate('ada');
      assertSuccess(result);
      expect(result.value).toBe('ada');
    });

    it('validates one item on its own, rejecting an invalid value', () => {
      const schema = pvl.array(pvl.string().min(2));
      expect(schema.element.validate('a').issues).toEqual([
        { code: 'TOO_SMALL', message: 'String must contain at least 2 character(s)' },
      ]);
      expect(schema.element.validate(42).issues).toEqual([
        { code: 'INVALID_TYPE', message: 'Expected string' },
      ]);
    });

    it("carries the item's own modifiers when validated on its own", () => {
      const schema = pvl.array(pvl.number().coerce());
      const result = schema.element.validate('42');
      assertSuccess(result);
      expect(result.value).toBe(42);
    });

    it('reaches a nested array item through its own element', () => {
      const inner = pvl.number();
      const schema = pvl.array(pvl.array(inner));
      expect(schema.element.element).toBe(inner);
    });

    it('reaches an object item through its shape', () => {
      const name = pvl.string();
      const schema = pvl.array(pvl.object({ name }));
      expect(schema.element.shape.name).toBe(name);
    });

    it('survives the length constraints and the base modifiers', () => {
      const item = pvl.string();
      const base = pvl.array(item);

      expect(base.min(1).element).toBe(item);
      expect(base.max(5).element).toBe(item);
      expect(base.length(2).element).toBe(item);
      expect(base.optional().element).toBe(item);
      expect(base.nullable().element).toBe(item);
      expect(base.refine(() => true).element).toBe(item);
    });

    it('leaves validation behaviour untouched', () => {
      const schema = pvl.array(pvl.string());
      const before = schema.validate(['a', 42]);

      schema.element.validate(42);

      expect(schema.validate(['a', 42])).toEqual(before);
    });

    it('rejects a replacement element, at the type level and at runtime', () => {
      const schema = pvl.array(pvl.string());
      expect((): void => {
        // @ts-expect-error `element` is read-only
        schema.element = pvl.number();
      }).toThrow(TypeError);
      expect(schema.validate(['a']).issues).toBeUndefined();
    });
  });

  describe('nested Issue shape (seam 4)', () => {
    it("reports a failing element's numeric index as its path", () => {
      const schema = pvl.array(pvl.string());
      const result = schema.validate(['a', 42, 'c']);
      expect(result.issues).toEqual([
        { code: 'INVALID_TYPE', message: 'Expected string', path: [1] },
      ]);
    });

    it('reports one issue per failing element, in index order', () => {
      const schema = pvl.array(pvl.string());
      const result = schema.validate([1, 'ok', 2]);
      expect(result.issues?.map((issue) => issue.path)).toEqual([[0], [2]]);
    });

    it('omits path for a top-level failure', () => {
      const result = pvl.array(pvl.string()).validate(42);
      expect(result.issues?.[0]?.path).toBeUndefined();
    });

    it("composes an object key path with a failing element's index for an array of objects", () => {
      const schema = pvl.array(pvl.object({ name: pvl.string() }));
      const result = schema.validate([{ name: 'ada' }, { name: 42 }]);
      expect(result.issues).toEqual([
        { code: 'INVALID_TYPE', message: 'Expected string', path: [1, 'name'] },
      ]);
    });

    it("composes a field key with a failing element's index for an object with an array field", () => {
      const schema = pvl.object({ tags: pvl.array(pvl.string()) });
      const result = schema.validate({ tags: ['a', 42] });
      expect(result.issues).toEqual([
        { code: 'INVALID_TYPE', message: 'Expected string', path: ['tags', 1] },
      ]);
    });

    it('composes two numeric indices for an array of arrays', () => {
      const schema = pvl.array(pvl.array(pvl.number()));
      const result = schema.validate([
        [1, 2],
        [3, 'x'],
      ]);
      expect(result.issues).toEqual([
        { code: 'INVALID_TYPE', message: 'Expected number', path: [1, 1] },
      ]);
    });
  });
});

describe('pvl.array() (property-based)', () => {
  it("accepts any array built from its item schema's accepted values", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (values) => {
        return pvl.array(pvl.string()).validate(values).issues === undefined;
      }),
    );
  });

  it('accepts any array within [min, max] length', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 2, maxLength: 5 }), (values) => {
        const result = pvl.array(pvl.string()).min(2).max(5).validate(values);
        return result.issues === undefined;
      }),
    );
  });

  it('paths a nested failure to the failing index, however deep', () => {
    const schema = pvl.array(pvl.object({ address: pvl.object({ zip: pvl.number() }) }));
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 5 }), (zips) => {
        const value = zips.map((zip) => ({ address: { zip } }));
        const result = schema.validate(value);
        return (
          result.issues?.length === value.length &&
          result.issues.every(
            (issue, index) =>
              JSON.stringify(issue.path) === JSON.stringify([index, 'address', 'zip']),
          )
        );
      }),
    );
  });
});
