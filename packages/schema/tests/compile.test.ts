import { describe, expect, expectTypeOf, it } from 'vitest';
import { pvl, type ReadOnlySchema, type StringSchema } from '../src/index.js';
import { assertSuccess } from './helpers.js';

describe('pvl.compile()', () => {
  it('returns the given object schema unchanged pre-compilation', () => {
    const schema = pvl.object({ name: pvl.string() });
    expect(pvl.compile(schema)).toBe(schema);
  });

  it('returns the given array schema unchanged pre-compilation', () => {
    const schema = pvl.array(pvl.string());
    expect(pvl.compile(schema)).toBe(schema);
  });

  it('still validates correctly through the normal interpreted path', () => {
    const objectSchema = pvl.compile(pvl.object({ name: pvl.string() }));
    expect(objectSchema.validate({ name: 'Ada' }).issues).toBeUndefined();
    expect(objectSchema.validate({ name: 42 }).issues).toBeDefined();

    const arraySchema = pvl.compile(pvl.array(pvl.string()));
    expect(arraySchema.validate(['a', 'b']).issues).toBeUndefined();
    expect(arraySchema.validate(['a', 42]).issues).toBeDefined();
  });

  it('rejects a bare primitive schema at the type level', () => {
    // @ts-expect-error pvl.compile() only accepts a composite (object/array) schema
    pvl.compile(pvl.string());
  });

  // Each of these is as much a type-level assertion as a runtime one: a
  // modifier that widened its schema back to the base `Schema` would make the
  // `pvl.compile()` call itself a compile error.
  describe('a composite schema carrying a modifier', () => {
    it('accepts a refined object schema', () => {
      const schema = pvl
        .object({ name: pvl.string() })
        .refine((value) => value.name.length > 0, { message: 'name must not be empty' });

      const compiled = pvl.compile(schema);
      expect(compiled).toBe(schema);
      expect(compiled.validate({ name: 'Ada' }).issues).toBeUndefined();
      expect(compiled.validate({ name: '' }).issues?.[0]?.message).toBe('name must not be empty');
    });

    it('accepts an optional object schema', () => {
      const schema = pvl.object({ name: pvl.string() }).optional();

      const compiled = pvl.compile(schema);
      expect(compiled).toBe(schema);
      expect(compiled.validate(undefined).issues).toBeUndefined();
    });

    it('accepts a nullable object schema', () => {
      const schema = pvl.object({ name: pvl.string() }).nullable();

      const compiled = pvl.compile(schema);
      expect(compiled).toBe(schema);
      expect(compiled.validate(null).issues).toBeUndefined();
    });

    it('accepts a transformed object schema', () => {
      const schema = pvl.object({ name: pvl.string() }).transform((value) => value.name.length);

      const compiled = pvl.compile(schema);
      const result = compiled.validate({ name: 'Ada' });
      assertSuccess(result);
      expect(result.value).toBe(3);
    });

    it('accepts a refined array schema', () => {
      const schema = pvl
        .array(pvl.string())
        .refine((value) => value.length % 2 === 0, { message: 'must have an even count' });

      const compiled = pvl.compile(schema);
      expect(compiled).toBe(schema);
      expect(compiled.validate(['a']).issues?.[0]?.message).toBe('must have an even count');
    });

    it('accepts an optional array schema', () => {
      const schema = pvl.array(pvl.string()).optional();

      const compiled = pvl.compile(schema);
      expect(compiled).toBe(schema);
      expect(compiled.validate(undefined).issues).toBeUndefined();
    });

    it('accepts a nullable array schema', () => {
      const schema = pvl.array(pvl.string()).nullable();

      const compiled = pvl.compile(schema);
      expect(compiled).toBe(schema);
      expect(compiled.validate(null).issues).toBeUndefined();
    });

    it('accepts a transformed array schema', () => {
      const schema = pvl.array(pvl.string()).transform((value) => value.length);

      const compiled = pvl.compile(schema);
      const result = compiled.validate(['a', 'b']);
      assertSuccess(result);
      expect(result.value).toBe(2);
    });

    it('accepts a chain of modifiers on a strict object schema', () => {
      const schema = pvl
        .object({ name: pvl.string() })
        .strict()
        .refine((value) => value.name !== 'root')
        .nullable();

      const compiled = pvl.compile(schema);
      expect(compiled).toBe(schema);
      expect(compiled.validate(null).issues).toBeUndefined();
      expect(compiled.validate({ name: 'root' }).issues).toBeDefined();
    });
  });

  // ADR-0016: a Compiled Schema is a Read-only Schema, plus `shape`/`element`
  // when nothing was transformed.
  describe('the type it hands back', () => {
    it('chains no modifier onto a compiled schema', () => {
      const compiled = pvl.compile(pvl.object({ name: pvl.string() }));
      // @ts-expect-error a Compiled Schema takes no modifier
      compiled.optional();
      // @ts-expect-error a Compiled Schema takes no modifier
      compiled.strict();
      // @ts-expect-error a Compiled Schema takes no modifier
      pvl.compile(pvl.array(pvl.string())).min(1);
    });

    it("keeps an untransformed object schema's shape and input/output", () => {
      const compiled = pvl.compile(pvl.object({ name: pvl.string() }).optional());
      expectTypeOf(compiled.shape.name).toEqualTypeOf<StringSchema>();
      expectTypeOf(compiled).toExtend<
        ReadOnlySchema<{ name: string } | undefined, { name: string } | undefined>
      >();
    });

    it("keeps an untransformed array schema's element", () => {
      const compiled = pvl.compile(pvl.array(pvl.string()).min(1));
      expectTypeOf(compiled.element).toEqualTypeOf<StringSchema>();
    });

    it('drops shape and element from a transformed composite', () => {
      const object = pvl.compile(
        pvl.object({ name: pvl.string() }).transform((value) => value.name),
      );
      const array = pvl.compile(pvl.array(pvl.string()).transform((value) => value.length));
      expectTypeOf(object).not.toHaveProperty('shape');
      expectTypeOf(array).not.toHaveProperty('element');
      expectTypeOf(object).toEqualTypeOf<ReadOnlySchema<{ name: string }, string>>();
    });

    it('rejects a transformed primitive', () => {
      // @ts-expect-error a primitive has no tree to compile, transformed or not
      pvl.compile(pvl.string().transform((value) => value.length));
    });

    it('rejects a union, which is not an object or array schema', () => {
      // @ts-expect-error pvl.compile() only accepts an object or array schema
      pvl.compile(pvl.union([pvl.object({ a: pvl.string() })]));
    });
  });
});
