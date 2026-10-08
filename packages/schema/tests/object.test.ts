import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ObjectSchema, pvl, type Schema } from '../src/index.js';
import { assertSuccess } from './helpers.js';

describe('pvl.object()', () => {
  it('accepts an object whose every field matches its schema', () => {
    const schema = pvl.object({ name: pvl.string(), age: pvl.number() });
    const result = schema.validate({ name: 'ada', age: 36 });
    assertSuccess(result);
    expect(result.value).toEqual({ name: 'ada', age: 36 });
  });

  it('rejects an object whose field fails its schema', () => {
    const schema = pvl.object({ name: pvl.string() });
    const result = schema.validate({ name: 42 });
    expect(result.issues).toBeDefined();
  });

  it('rejects a missing required field', () => {
    const schema = pvl.object({ name: pvl.string() });
    const result = schema.validate({});
    expect(result.issues).toBeDefined();
  });

  it('accepts an empty shape against an empty object', () => {
    const result = pvl.object({}).validate({});
    assertSuccess(result);
    expect(result.value).toEqual({});
  });

  it('rejects a non-object', () => {
    const schema = pvl.object({ name: pvl.string() });
    expect(schema.validate('nope').issues).toBeDefined();
    expect(schema.validate(42).issues).toBeDefined();
    expect(schema.validate(undefined).issues).toBeDefined();
  });

  it('rejects null', () => {
    const result = pvl.object({ name: pvl.string() }).validate(null);
    expect(result.issues).toBeDefined();
  });

  it('rejects an array', () => {
    const result = pvl.object({ name: pvl.string() }).validate(['ada']);
    expect(result.issues).toBeDefined();
  });

  it('reports one issue per failing field rather than stopping at the first', () => {
    const schema = pvl.object({ name: pvl.string(), age: pvl.number() });
    const result = schema.validate({ name: 42, age: 'old' });
    expect(result.issues).toHaveLength(2);
  });

  describe('unknown keys', () => {
    it('strips unknown keys by default', () => {
      const schema = pvl.object({ name: pvl.string() });
      const result = schema.validate({ name: 'ada', extra: true });
      assertSuccess(result);
      expect(result.value).toEqual({ name: 'ada' });
      expect('extra' in result.value).toBe(false);
    });

    it('reports an unknown key as an Issue under .strict()', () => {
      const schema = pvl.object({ name: pvl.string() }).strict();
      const result = schema.validate({ name: 'ada', extra: true });
      expect(result.issues).toBeDefined();
    });

    it('accepts an exactly-matching object under .strict()', () => {
      const schema = pvl.object({ name: pvl.string() }).strict();
      const result = schema.validate({ name: 'ada' });
      assertSuccess(result);
      expect(result.value).toEqual({ name: 'ada' });
    });

    it('keeps unknown keys under .passthrough()', () => {
      const schema = pvl.object({ name: pvl.string() }).passthrough();
      const result = schema.validate({ name: 'ada', extra: true });
      assertSuccess(result);
      expect(result.value).toEqual({ name: 'ada', extra: true });
    });

    it('still validates known keys under .passthrough()', () => {
      const schema = pvl.object({ name: pvl.string() }).passthrough();
      const result = schema.validate({ name: 42, extra: true });
      expect(result.issues).toBeDefined();
    });

    it('applies only the last-selected unknown-key behavior', () => {
      const schema = pvl.object({ name: pvl.string() }).strict().passthrough();
      const result = schema.validate({ name: 'ada', extra: true });
      assertSuccess(result);
      expect(result.value).toEqual({ name: 'ada', extra: true });
    });

    it('lets a later .strict() undo an earlier .passthrough()', () => {
      const schema = pvl.object({ name: pvl.string() }).passthrough().strict();
      expect(schema.validate({ name: 'ada', extra: true }).issues?.[0]?.code).toBe(
        'UNRECOGNIZED_KEY',
      );
    });

    it('does not mutate the input it strips or passes through', () => {
      const input = { name: 'ada', extra: true };
      pvl.object({ name: pvl.string() }).validate(input);
      pvl.object({ name: pvl.string() }).passthrough().validate(input);
      expect(input).toEqual({ name: 'ada', extra: true });
    });

    it("does not let a passed-through `__proto__` key change the output's prototype", () => {
      const schema = pvl.object({ name: pvl.string() }).passthrough();
      const input = JSON.parse('{"name":"ada","__proto__":{"polluted":true}}') as unknown;
      const result = schema.validate(input);
      assertSuccess(result);
      expect(Object.getPrototypeOf(result.value)).toBe(Object.prototype);
      expect('polluted' in (result.value as Record<string, unknown>)).toBe(false);
    });
  });

  describe('field-level modifiers', () => {
    it('accepts an omitted field whose schema is .optional()', () => {
      const schema = pvl.object({
        name: pvl.string(),
        nickname: pvl.string().optional(),
      });
      const result = schema.validate({ name: 'ada' });
      assertSuccess(result);
      expect(result.value).toEqual({ name: 'ada' });
    });

    it('omits an absent optional field from the output rather than setting it to undefined', () => {
      const schema = pvl.object({ nickname: pvl.string().optional() });
      const result = schema.validate({});
      assertSuccess(result);
      expect(Object.keys(result.value)).toEqual([]);
    });

    it('accepts null for a field whose schema is .nullable()', () => {
      const schema = pvl.object({ nickname: pvl.string().nullable() });
      const result = schema.validate({ nickname: null });
      assertSuccess(result);
      expect(result.value).toEqual({ nickname: null });
    });

    it("applies a field's .transform() to the output", () => {
      const schema = pvl.object({
        name: pvl.string().transform((value) => value.length),
      });
      const result = schema.validate({ name: 'ada' });
      assertSuccess(result);
      expect(result.value).toEqual({ name: 3 });
    });

    it("applies a field's .coerce() before its own check", () => {
      const schema = pvl.object({ age: pvl.number().coerce() });
      const result = schema.validate({ age: '36' });
      assertSuccess(result);
      expect(result.value).toEqual({ age: 36 });
    });

    it("reports a failing field's .refine()", () => {
      const schema = pvl.object({
        name: pvl.string().refine((value) => value.length > 3, {
          message: 'too short',
        }),
      });
      const result = schema.validate({ name: 'ada' });
      expect(result.issues?.[0]?.message).toBe('too short');
    });
  });

  describe('inherited base modifiers', () => {
    it('accepts undefined once .optional()', () => {
      const schema = pvl.object({ name: pvl.string() }).optional();
      const result = schema.validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
    });

    it('accepts null once .nullable()', () => {
      const schema = pvl.object({ name: pvl.string() }).nullable();
      const result = schema.validate(null);
      assertSuccess(result);
      expect(result.value).toBeNull();
    });

    it("rejects an object failing the schema's own .refine()", () => {
      const schema = pvl
        .object({ min: pvl.number(), max: pvl.number() })
        .refine((value) => value.min <= value.max, {
          message: 'min must not exceed max',
        });
      expect(schema.validate({ min: 1, max: 2 }).issues).toBeUndefined();
      expect(schema.validate({ min: 3, max: 2 }).issues?.[0]?.message).toBe(
        'min must not exceed max',
      );
    });

    it("applies the schema's own .transform()", () => {
      const schema = pvl
        .object({ name: pvl.string() })
        .transform((value) => value.name.toUpperCase());
      const result = schema.validate({ name: 'ada' });
      assertSuccess(result);
      expect(result.value).toBe('ADA');
    });

    it('leaves the value unchanged once .coerce(), having no object-specific conversion', () => {
      const schema = pvl.object({ name: pvl.string() }).coerce();
      const accepted = schema.validate({ name: 'ada' });
      assertSuccess(accepted);
      expect(accepted.value).toEqual({ name: 'ada' });
      expect(schema.validate('{"name":"ada"}').issues).toBeDefined();
    });

    it('keeps .optional() through a later .strict()', () => {
      const schema = pvl.object({ name: pvl.string() }).optional().strict();
      const result = schema.validate(undefined);
      assertSuccess(result);
      expect(result.value).toBeUndefined();
      expect(schema.validate({ name: 'ada', extra: 1 }).issues?.[0]?.code).toBe('UNRECOGNIZED_KEY');
    });

    it('hands back a distinct, prototype-preserving clone', () => {
      const schema = pvl.object({ name: pvl.string() });
      const refined = schema.refine(() => true);
      expect(refined).not.toBe(schema);
      expect(refined).toBeInstanceOf(ObjectSchema);
      expect(schema.optional().nullable()).toBeInstanceOf(ObjectSchema);
      // The original is untouched — a modifier never mutates in place.
      expect(schema.validate(undefined).issues).toBeDefined();
    });

    it('keeps .refine() through a later .strict()', () => {
      const schema = pvl
        .object({ name: pvl.string() })
        .refine((value) => value.name !== 'root', { message: 'reserved name' })
        .strict();
      expect(schema.validate({ name: 'root' }).issues?.[0]?.message).toBe('reserved name');
      expect(schema.validate({ name: 'ada', extra: 1 }).issues?.[0]?.code).toBe('UNRECOGNIZED_KEY');
      expect(schema.validate({ name: 'ada' }).issues).toBeUndefined();
    });

    it('exposes Standard Schema conformance', () => {
      const schema = pvl.object({ name: pvl.string() });
      expect(schema['~standard'].version).toBe(1);
      expect(schema['~standard'].vendor).toBe('@pvl/schema');
      expect(schema['~standard'].validate({ name: 'ada' })).toEqual({
        value: { name: 'ada' },
      });
    });
  });

  describe('shape', () => {
    it("exposes each declared key's own schema instance", () => {
      const name = pvl.string();
      const age = pvl.number();
      const schema = pvl.object({ name, age });

      expect(Object.keys(schema.shape)).toEqual(['name', 'age']);
      expect(schema.shape.name).toBe(name);
      expect(schema.shape.age).toBe(age);
    });

    it('exposes no keys for an empty shape', () => {
      expect(Object.keys(pvl.object({}).shape)).toEqual([]);
    });

    it('validates one field on its own, accepting a valid value', () => {
      const schema = pvl.object({ name: pvl.string().min(2), age: pvl.number() });
      const result = schema.shape.name.validate('ada');
      assertSuccess(result);
      expect(result.value).toBe('ada');
    });

    it('validates one field on its own, rejecting an invalid value', () => {
      const schema = pvl.object({ name: pvl.string().min(2), age: pvl.number() });
      const result = schema.shape.name.validate('a');
      expect(result.issues).toEqual([
        { code: 'TOO_SMALL', message: 'String must contain at least 2 character(s)' },
      ]);
    });

    it("carries the field's own modifiers when validated on its own", () => {
      const schema = pvl.object({ nickname: pvl.string().optional() });
      expect(schema.shape.nickname.validate(undefined).issues).toBeUndefined();
      expect(schema.shape.nickname.validate(42).issues).toBeDefined();
    });

    it('reaches a nested object field through its own shape', () => {
      const city = pvl.string();
      const schema = pvl.object({ user: pvl.object({ city }) });
      expect(schema.shape.user.shape.city).toBe(city);
      expect(schema.shape.user.shape.city.validate(42).issues).toBeDefined();
    });

    it('reaches a nested array field through its element', () => {
      const tag = pvl.string();
      const schema = pvl.object({ tags: pvl.array(tag) });
      expect(schema.shape.tags.element).toBe(tag);
    });

    it('survives .strict(), .passthrough() and the base modifiers', () => {
      const name = pvl.string();
      const base = pvl.object({ name });

      expect(base.strict().shape.name).toBe(name);
      expect(base.passthrough().shape.name).toBe(name);
      expect(base.optional().shape.name).toBe(name);
      expect(base.nullable().shape.name).toBe(name);
      expect(base.refine(() => true).shape.name).toBe(name);
    });

    it('leaves validation behaviour untouched', () => {
      const schema = pvl.object({ name: pvl.string() });
      const before = schema.validate({ name: 'ada', extra: true });

      schema.shape.name.validate(42);

      expect(schema.validate({ name: 'ada', extra: true })).toEqual(before);
    });

    it('rejects a replacement shape, at the type level and at runtime', () => {
      const schema = pvl.object({ name: pvl.string() });
      expect((): void => {
        // @ts-expect-error `shape` is read-only
        schema.shape = { name: pvl.number() };
      }).toThrow(TypeError);
      expect(schema.validate({ name: 'ada' }).issues).toBeUndefined();
    });

    // Not a runtime assertion: per the parent spec, immutability below the
    // accessor is the type system's job, so the only thing to check is that
    // the write does not typecheck. Left unchecked it would be the silent
    // failure — the constructor snapshots the fields, so a per-key write would
    // make `shape` disagree with `validate()`.
    it('rejects a replacement field at the type level', () => {
      const schema = pvl.object({ name: pvl.string() });
      // @ts-expect-error each key of `shape` is read-only
      schema.shape.name = pvl.string().min(5);
    });

    it('ignores a later mutation of the object literal it was built with', () => {
      const original = pvl.string();
      const declared: Record<string, Schema<unknown, unknown>> = { name: original };
      const schema = pvl.object(declared);

      declared.name = pvl.number();

      expect(schema.shape.name).toBe(original);
      expect(schema.validate({ name: 'ada' }).issues).toBeUndefined();
    });
  });

  describe('nested Issue shape (seam 4)', () => {
    it("reports the failing field's key as its path", () => {
      const schema = pvl.object({ name: pvl.string() });
      const result = schema.validate({ name: 42 });
      expect(result.issues).toEqual([
        { code: 'INVALID_TYPE', message: 'Expected string', path: ['name'] },
      ]);
    });

    it('reports the full path for a multi-level-nested failing field', () => {
      const schema = pvl.object({
        user: pvl.object({ address: pvl.object({ city: pvl.string() }) }),
      });
      const result = schema.validate({ user: { address: { city: 42 } } });
      expect(result.issues).toEqual([
        {
          code: 'INVALID_TYPE',
          message: 'Expected string',
          path: ['user', 'address', 'city'],
        },
      ]);
    });

    it('reports the path of a nested object that is not an object at all', () => {
      const schema = pvl.object({ user: pvl.object({ name: pvl.string() }) });
      const result = schema.validate({ user: 'ada' });
      expect(result.issues).toEqual([
        { code: 'INVALID_TYPE', message: 'Expected object', path: ['user'] },
      ]);
    });

    it('omits path for a top-level failure', () => {
      const result = pvl.object({ name: pvl.string() }).validate(42);
      expect(result.issues?.[0]?.path).toBeUndefined();
    });

    it('reports every failing field of a nested object, in shape order', () => {
      const schema = pvl.object({
        user: pvl.object({ name: pvl.string(), age: pvl.number() }),
      });
      const result = schema.validate({ user: { name: 42, age: 'old' } });
      expect(result.issues?.map((issue) => issue.path)).toEqual([
        ['user', 'name'],
        ['user', 'age'],
      ]);
    });

    it("reports an unrecognized key at that key's path under .strict()", () => {
      const schema = pvl.object({ name: pvl.string() }).strict();
      const result = schema.validate({ name: 'ada', extra: true });
      expect(result.issues).toEqual([
        {
          code: 'UNRECOGNIZED_KEY',
          message: 'Unrecognized key "extra"',
          path: ['extra'],
        },
      ]);
    });

    it('reports one issue per unrecognized key under .strict()', () => {
      const schema = pvl.object({ name: pvl.string() }).strict();
      const result = schema.validate({ name: 'ada', a: 1, b: 2 });
      expect(result.issues?.map((issue) => issue.path)).toEqual([['a'], ['b']]);
    });

    it('uses a custom .strict() message for an unrecognized key', () => {
      const schema = pvl
        .object({ name: pvl.string() })
        .strict({ message: 'no extra keys allowed' });
      const result = schema.validate({ name: 'ada', extra: true });
      expect(result.issues?.[0]?.message).toBe('no extra keys allowed');
    });
  });
});

describe('pvl.object() (property-based)', () => {
  it("accepts any object built from its own fields' accepted values", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer(), (name, age) => {
        const schema = pvl.object({ name: pvl.string(), age: pvl.number() });
        return schema.validate({ name, age }).issues === undefined;
      }),
    );
  });

  it("accepts any deeply nested object built from its fields' accepted values", () => {
    const schema = pvl.object({
      user: pvl.object({
        name: pvl.string(),
        address: pvl.object({ city: pvl.string(), zip: pvl.number() }),
      }),
    });
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.integer(),
        (name, city, zip) =>
          schema.validate({ user: { name, address: { city, zip } } }).issues === undefined,
      ),
    );
  });

  it('paths a nested failure to the field that failed, however deep', () => {
    const schema = pvl.object({
      user: pvl.object({ address: pvl.object({ zip: pvl.number() }) }),
    });
    fc.assert(
      fc.property(fc.string(), (zip) => {
        const result = schema.validate({ user: { address: { zip } } });
        return (
          result.issues?.length === 1 &&
          JSON.stringify(result.issues[0]?.path) === JSON.stringify(['user', 'address', 'zip'])
        );
      }),
    );
  });

  it('strips any extra key by default and keeps it under .passthrough()', () => {
    fc.assert(
      fc.property(
        fc.string().filter((key) => key !== 'name' && key !== '__proto__'),
        fc.integer(),
        (key, extra) => {
          const input = { name: 'ada', [key]: extra };
          const stripped = pvl.object({ name: pvl.string() }).validate(input);
          const kept = pvl.object({ name: pvl.string() }).passthrough().validate(input);
          if (stripped.issues || kept.issues) {
            return false;
          }
          return (
            !Object.hasOwn(stripped.value, key) &&
            (kept.value as Record<string, unknown>)[key] === extra
          );
        },
      ),
    );
  });
});
