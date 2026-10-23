import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  pvl,
  type Schema,
  type StandaloneMarker,
  type StringInterpretedSchema,
} from '../src/index.js';
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

  it('returns the given primitive schema unchanged pre-compilation', () => {
    const schema = pvl.string();
    expect(pvl.compile(schema)).toBe(schema);
  });

  it('returns the given union schema unchanged pre-compilation', () => {
    const schema = pvl.union([pvl.string(), pvl.number()]);
    expect(pvl.compile(schema)).toBe(schema);
  });

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

  it('returns a schema carrying Standalone Keys unchanged pre-compilation', () => {
    const schema = pvl.object({ email: pvl.string().standalone(), age: pvl.number() });
    expect(pvl.compile(schema)).toBe(schema);

    const marked = pvl.string().standalone();
    expect(pvl.compile(marked)).toBe(marked);
  });

  // ADR-0020 and ADR-0036: a Compiled Schema is a plain Schema, keeping its
  // `shape`/`element` and its Standalone marker.
  describe('the type it hands back', () => {
    it('chains no modifier or structural method onto a compiled schema', () => {
      const compiled = pvl.compile(pvl.object({ name: pvl.string() }));
      // @ts-expect-error a Compiled Schema takes no modifier
      compiled.optional();
      // @ts-expect-error a Compiled Schema takes no modifier
      compiled.strict();
      // @ts-expect-error a Compiled Schema takes no modifier
      compiled.passthrough();
      const array = pvl.compile(pvl.array(pvl.string()));
      // @ts-expect-error a Compiled Schema takes no modifier
      array.min(1);
      // @ts-expect-error a Compiled Schema takes no modifier
      array.max(1);
      // @ts-expect-error a Compiled Schema takes no modifier
      array.length(1);
    });

    it("hands back a plain Schema with an object schema's input/output and its shape", () => {
      const compiled = pvl.compile(
        pvl.object({ name: pvl.string().standalone(), age: pvl.number() }).optional(),
      );
      expectTypeOf(compiled).toEqualTypeOf<
        Schema<
          { name: string; age: number } | undefined,
          { name: string; age: number } | undefined
        > & {
          readonly shape: { readonly name: Schema<string, string> & StandaloneMarker };
        }
      >();
    });

    it('hands back a plain Schema with its element for an array schema', () => {
      const compiled = pvl.compile(pvl.array(pvl.string()).min(1));
      expectTypeOf(compiled).toEqualTypeOf<
        Schema<string[], string[]> & { readonly element: StringInterpretedSchema }
      >();
    });

    it("carries a transformed composite's output type, without its shape or element", () => {
      const object = pvl.compile(
        pvl.object({ name: pvl.string().standalone() }).transform((value) => value.name),
      );
      const array = pvl.compile(pvl.array(pvl.string()).transform((value) => value.length));
      expectTypeOf(object).toEqualTypeOf<Schema<{ name: string }, string>>();
      expectTypeOf(array).toEqualTypeOf<Schema<string[], number>>();
    });

    it('hands back a plain Schema for a primitive, transformed or not', () => {
      const plain = pvl.compile(pvl.string().min(1));
      const transformed = pvl.compile(pvl.string().transform((value) => value.length));
      // @ts-expect-error a Compiled Schema takes no modifier
      plain.max(5);
      expectTypeOf(plain).toEqualTypeOf<Schema<string, string>>();
      expectTypeOf(transformed).toEqualTypeOf<Schema<string, number>>();
    });

    it('types pvl.compile(x.standalone()) as pvl.compile(x).standalone()', () => {
      const object = pvl.object({ name: pvl.string().standalone() });
      expectTypeOf(pvl.compile(object.standalone())).toEqualTypeOf(
        pvl.compile(object).standalone(),
      );
      expectTypeOf(pvl.compile(pvl.string().standalone())).toEqualTypeOf<
        Schema<string, string> & StandaloneMarker
      >();
      expectTypeOf(pvl.compile(pvl.string()).standalone()).toEqualTypeOf<
        Schema<string, string> & StandaloneMarker
      >();
    });

    it('keeps a marker chained before other modifiers, and types a marked element as compiled', () => {
      expectTypeOf(pvl.compile(pvl.string().standalone().min(1).optional())).toEqualTypeOf<
        Schema<string | undefined, string | undefined> & StandaloneMarker
      >();
      expectTypeOf(pvl.compile(pvl.array(pvl.string().standalone().min(1)))).toEqualTypeOf<
        Schema<string[], string[]> & {
          readonly element: Schema<string, string> & StandaloneMarker;
        }
      >();
    });
  });
});
