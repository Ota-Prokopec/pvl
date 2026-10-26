import { describe, expectTypeOf, it } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ValueOfEnum } from '@repo/types';
import {
  pvl,
  type NumberInterpretedSchema,
  type Schema,
  type StandaloneMarker,
  type StringInterpretedSchema,
} from '../src/index.js';

const SYSTEM_ROLE = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const;

const HTTP_STATUS = {
  OK_200: 200,
  NOT_FOUND_404: 404,
} as const;

describe('type inference', () => {
  it("infers pvl.string()'s input/output as string", () => {
    const schema = pvl.string();
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string>();
  });

  it("infers a transformed pvl.string()'s differing input/output", () => {
    const schema = pvl.string().transform((value) => value.length);
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number>();
  });

  it("infers pvl.number()'s input/output as number", () => {
    const schema = pvl.number();
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<number>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number>();
  });

  it("infers a transformed pvl.number()'s differing input/output", () => {
    const schema = pvl.number().transform((value) => value.toFixed(2));
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<number>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string>();
  });

  it("infers pvl.boolean()'s input/output as boolean", () => {
    const schema = pvl.boolean();
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<boolean>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<boolean>();
  });

  it("infers a transformed pvl.boolean()'s differing input/output", () => {
    const schema = pvl.boolean().transform((value): number => (value ? 1 : 0));
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<boolean>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number>();
  });

  it("infers pvl.bigint()'s input/output as bigint", () => {
    const schema = pvl.bigint();
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<bigint>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<bigint>();
  });

  it("infers a transformed pvl.bigint()'s differing input/output", () => {
    const schema = pvl.bigint().transform((value) => value.toString());
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<bigint>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string>();
  });
  it("infers pvl.literal()'s input/output as the literal type", () => {
    const schema = pvl.literal('OWNER');
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<'OWNER'>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<'OWNER'>();
  });

  it("infers a numeric pvl.literal()'s input/output as the literal type", () => {
    const schema = pvl.literal(42);
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<42>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<42>();
  });

  it("infers pvl.enum()'s input/output from an `as const` object via ValueOfEnum", () => {
    const schema = pvl.enum(SYSTEM_ROLE);
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<
      ValueOfEnum<typeof SYSTEM_ROLE>
    >();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<'OWNER' | 'MEMBER'>();
  });

  it("infers pvl.enum()'s input/output from a string-literal array", () => {
    const schema = pvl.enum(['A', 'B']);
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<'A' | 'B'>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<'A' | 'B'>();
  });

  it("infers a numeric enum object's values, not its keys", () => {
    const schema = pvl.enum(HTTP_STATUS);
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<
      ValueOfEnum<typeof HTTP_STATUS>
    >();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<200 | 404>();
  });

  it("infers pvl.object()'s input/output as the composed object type", () => {
    const schema = pvl.object({ name: pvl.string(), age: pvl.number() });
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<{
      name: string;
      age: number;
    }>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      name: string;
      age: number;
    }>();
  });

  it('infers an .optional() field as an optional key', () => {
    const schema = pvl.object({
      name: pvl.string(),
      nickname: pvl.string().optional(),
    });
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      name: string;
      nickname?: string | undefined;
    }>();
  });

  it('infers a .nullable() field as a required key that may be null', () => {
    const schema = pvl.object({ nickname: pvl.string().nullable() });
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      nickname: string | null;
    }>();
  });

  it('infers an .optional().nullable() field as an optional, nullable key', () => {
    const schema = pvl.object({ nickname: pvl.string().optional().nullable() });
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      nickname?: string | null | undefined;
    }>();
  });

  it("infers a nested pvl.object()'s composed type", () => {
    const schema = pvl.object({
      user: pvl.object({ name: pvl.string() }),
    });
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      user: { name: string };
    }>();
  });

  it("infers a transformed field's differing input/output", () => {
    const schema = pvl.object({
      name: pvl.string().transform((value) => value.length),
    });
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<{
      name: string;
    }>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      name: number;
    }>();
  });

  it("infers .passthrough()'s output as the known keys plus untyped unknown ones", () => {
    const schema = pvl.object({ name: pvl.string() }).passthrough();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<
      { name: string } & Record<string, unknown>
    >();
  });

  it("infers .strict()'s output as the known keys only", () => {
    const schema = pvl.object({ name: pvl.string() }).strict();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      name: string;
    }>();
  });

  it("infers a transformed pvl.enum()'s differing input/output", () => {
    const schema = pvl.enum(SYSTEM_ROLE).transform((value) => value.length);
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<'OWNER' | 'MEMBER'>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number>();
  });

  it("infers a pvl.union()'s input/output as the union of its members' types", () => {
    const schema = pvl.union([pvl.string(), pvl.number(), pvl.boolean()]);
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<
      string | number | boolean
    >();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<
      string | number | boolean
    >();
  });

  it("infers a pvl.union()'s differing input/output when a member has a .transform()", () => {
    const schema = pvl.union([pvl.string(), pvl.number().transform((value) => value.toFixed(2))]);
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string | number>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string>();
  });

  it("infers pvl.array()'s input/output as the item's element type", () => {
    const schema = pvl.array(pvl.string());
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string[]>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string[]>();
  });

  it("infers a transformed item's differing element input/output", () => {
    const schema = pvl.array(pvl.string().transform((value) => value.length));
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string[]>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number[]>();
  });

  it("infers an array of objects' element type", () => {
    const schema = pvl.array(pvl.object({ name: pvl.string() }));
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{ name: string }[]>();
  });

  it("infers an object with an array field's composed type", () => {
    const schema = pvl.object({ tags: pvl.array(pvl.string()) });
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      tags: string[];
    }>();
  });

  it("infers an array of arrays' nested element type", () => {
    const schema = pvl.array(pvl.array(pvl.number()));
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number[][]>();
  });

  it("leaves a refined object schema's input/output untouched", () => {
    const schema = pvl.object({ name: pvl.string() }).refine((value) => value.name.length > 0);
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{ name: string }>();
  });

  it("widens an optional object schema's input/output with undefined", () => {
    const schema = pvl.object({ name: pvl.string() }).optional();
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<
      { name: string } | undefined
    >();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<
      { name: string } | undefined
    >();
  });

  it('keeps an earlier widening through a later .strict()', () => {
    const schema = pvl.object({ name: pvl.string() }).optional().strict();
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<
      { name: string } | undefined
    >();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<
      { name: string } | undefined
    >();
  });

  it('keeps an earlier widening through a later .passthrough()', () => {
    const schema = pvl.object({ name: pvl.string() }).optional().passthrough();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<
      ({ name: string } & Record<string, unknown>) | undefined
    >();
  });

  it("widens a nullable object schema's input/output with null", () => {
    const schema = pvl.object({ name: pvl.string() }).nullable();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      name: string;
    } | null>();
  });

  it("infers a transformed object schema's differing input/output", () => {
    const schema = pvl.object({ name: pvl.string() }).transform((value) => value.name.length);
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number>();
  });

  it("widens an optional array schema's input/output with undefined", () => {
    const schema = pvl.array(pvl.string()).optional();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<
      string[] | undefined
    >();
  });

  it("infers a transformed array schema's differing input/output", () => {
    const schema = pvl.array(pvl.string()).transform((value) => value.length);
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string[]>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number>();
  });

  it('infers an .optional() composite field as an optional key', () => {
    const schema = pvl.object({
      name: pvl.string(),
      address: pvl.object({ city: pvl.string() }).optional(),
      tags: pvl.array(pvl.string()).optional(),
    });
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      name: string;
      address?: { city: string } | undefined;
      tags?: string[] | undefined;
    }>();
  });

  it("keeps a refined string schema's own constraint methods reachable", () => {
    const schema = pvl.string().refine((value) => value !== 'root');
    expectTypeOf(schema.min(1)).toEqualTypeOf<StringInterpretedSchema>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string>();
  });

  // standalone-keys.md: `shape` holds the Standalone Keys only.
  it("types shape as each Standalone Key's own schema, and no other key", () => {
    const schema = pvl.object({ name: pvl.string().standalone(), age: pvl.number() });
    expectTypeOf(schema.shape).toEqualTypeOf<{
      readonly name: StringInterpretedSchema & StandaloneMarker;
    }>();
    expectTypeOf(schema.shape).not.toHaveProperty('age');
  });

  it('types shape as {} for an object without a Standalone Key', () => {
    expectTypeOf(pvl.object({ name: pvl.string() }).shape).toEqualTypeOf<{}>();
    expectTypeOf(pvl.object({}).shape).toEqualTypeOf<{}>();
  });

  it('types every key of shape as read-only, not just the accessor', () => {
    const schema = pvl.object({ name: pvl.string().standalone() });
    expectTypeOf(schema.shape).not.toEqualTypeOf<{
      name: StringInterpretedSchema & StandaloneMarker;
    }>();
  });

  it("infers a field's own input/output through shape", () => {
    const schema = pvl.object({
      name: pvl
        .string()
        .transform((value) => value.length)
        .standalone(),
    });
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema.shape.name>>().toEqualTypeOf<string>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema.shape.name>>().toEqualTypeOf<number>();
  });

  it("types a nested composite's shape and element through a Standalone Key only", () => {
    const schema = pvl.object({
      user: pvl.object({ city: pvl.string().standalone(), zip: pvl.string() }).standalone(),
      tags: pvl.array(pvl.number().standalone()).standalone(),
      hidden: pvl.object({ city: pvl.string().standalone() }),
    });
    expectTypeOf(schema.shape.user.shape).toEqualTypeOf<{
      readonly city: StringInterpretedSchema & StandaloneMarker;
    }>();
    expectTypeOf(schema.shape.tags.element).toEqualTypeOf<
      NumberInterpretedSchema & StandaloneMarker
    >();
    expectTypeOf(schema.shape).not.toHaveProperty('hidden');
  });

  it('keeps shape typed through .strict(), .passthrough(), the base modifiers, .standalone() and pvl.compile()', () => {
    const base = pvl.object({ name: pvl.string().standalone() });
    type Name = StringInterpretedSchema & StandaloneMarker;
    expectTypeOf(base.strict().shape.name).toEqualTypeOf<Name>();
    expectTypeOf(base.passthrough().shape.name).toEqualTypeOf<Name>();
    expectTypeOf(base.optional().shape.name).toEqualTypeOf<Name>();
    expectTypeOf(base.nullable().shape.name).toEqualTypeOf<Name>();
    expectTypeOf(base.refine(() => true).shape.name).toEqualTypeOf<Name>();
    expectTypeOf(base.standalone().shape.name).toEqualTypeOf<Name>();
    // A compiled Standalone Key is a plain Schema, as its compiled validator is.
    expectTypeOf(pvl.compile(base).shape.name).toEqualTypeOf<
      Schema<string, string> & StandaloneMarker
    >();
  });

  it("types element as the item's own schema class when the item is marked, and undefined otherwise", () => {
    expectTypeOf(pvl.array(pvl.string().standalone()).element).toEqualTypeOf<
      StringInterpretedSchema & StandaloneMarker
    >();
    expectTypeOf(pvl.array(pvl.string()).element).toEqualTypeOf<undefined>();
  });

  it("infers the item's own input/output through element", () => {
    const schema = pvl.array(
      pvl
        .string()
        .transform((value) => value.length)
        .standalone(),
    );
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema.element>>().toEqualTypeOf<string>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema.element>>().toEqualTypeOf<number>();
  });

  it('keeps element typed through the length constraints, the base modifiers, .standalone() and pvl.compile()', () => {
    const base = pvl.array(pvl.string().standalone());
    type Item = StringInterpretedSchema & StandaloneMarker;
    expectTypeOf(base.min(1).element).toEqualTypeOf<Item>();
    expectTypeOf(base.max(5).element).toEqualTypeOf<Item>();
    expectTypeOf(base.length(2).element).toEqualTypeOf<Item>();
    expectTypeOf(base.optional().element).toEqualTypeOf<Item>();
    expectTypeOf(base.nullable().element).toEqualTypeOf<Item>();
    expectTypeOf(base.refine(() => true).element).toEqualTypeOf<Item>();
    expectTypeOf(base.standalone().element).toEqualTypeOf<Item>();
    // A compiled marked element is a plain Schema, as its compiled validator is.
    expectTypeOf(pvl.compile(base).element).toEqualTypeOf<
      Schema<string, string> & StandaloneMarker
    >();
  });

  it('makes a transformed schema plain: no modifier, no shape and no element', () => {
    const string = pvl.string().transform((value) => value.length);
    const object = pvl.object({ name: pvl.string().standalone() }).transform((value) => value.name);
    const array = pvl.array(pvl.string()).transform((value) => value.length);

    expectTypeOf(string).toEqualTypeOf<Schema<string, number>>();
    expectTypeOf(object).toEqualTypeOf<Schema<{ name: string }, string>>();
    expectTypeOf(array).toEqualTypeOf<Schema<string[], number>>();
    expectTypeOf(object.standalone()).not.toHaveProperty('shape');
    expectTypeOf(array.standalone()).not.toHaveProperty('element');
    expectTypeOf(pvl.compile(object)).not.toHaveProperty('shape');
    expectTypeOf(pvl.compile(array)).not.toHaveProperty('element');
    for (const modifier of ['optional', 'nullable', 'refine', 'transform', 'coerce'] as const) {
      expectTypeOf(string).not.toHaveProperty(modifier);
      expectTypeOf(object).not.toHaveProperty(modifier);
    }
    expectTypeOf(object).not.toHaveProperty('strict');
    expectTypeOf(array).not.toHaveProperty('min');
  });

  it('exposes no member Schemas on a union', () => {
    const union = pvl.union([pvl.string().standalone(), pvl.number()]);
    expectTypeOf(union).not.toHaveProperty('shape');
    expectTypeOf(union).not.toHaveProperty('options');
    expectTypeOf(pvl.compile(union)).toEqualTypeOf<Schema<string | number, string | number>>();
  });

  it('types a .transform() chained after .nullable()/.optional() with null/undefined', () => {
    pvl
      .string()
      .nullable()
      .optional()
      .transform((value) => {
        expectTypeOf(value).toEqualTypeOf<string | null | undefined>();
        return value;
      });
  });

  it('keeps a primitive schema class through .optional(), .nullable() and .coerce()', () => {
    expectTypeOf(pvl.string().optional().min(2)).toEqualTypeOf<
      StringInterpretedSchema<string | undefined, string | undefined>
    >();
    expectTypeOf(pvl.number().nullable().int()).toEqualTypeOf<
      NumberInterpretedSchema<number | null, number | null>
    >();
    expectTypeOf(pvl.number().coerce().min(1)).toEqualTypeOf<
      NumberInterpretedSchema<unknown, number>
    >();
  });
});
