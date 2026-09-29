import { describe, expectTypeOf, it } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ValueOfEnum } from '@repo/types';
import { pvl, type NumberSchema, type StringSchema } from '../src/index.js';

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
    expectTypeOf(schema.min(1)).toEqualTypeOf<StringSchema>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string>();
  });

  it("types shape as each declared key's own schema class", () => {
    const schema = pvl.object({ name: pvl.string(), age: pvl.number() });
    expectTypeOf(schema.shape).toEqualTypeOf<Readonly<{ name: StringSchema; age: NumberSchema }>>();
    expectTypeOf(schema.shape.name).toEqualTypeOf<StringSchema>();
  });

  it('types every key of shape as read-only, not just the accessor', () => {
    const schema = pvl.object({ name: pvl.string() });
    expectTypeOf(schema.shape).toEqualTypeOf<{ readonly name: StringSchema }>();
    expectTypeOf(schema.shape).not.toEqualTypeOf<{ name: StringSchema }>();
  });

  it("infers a field's own input/output through shape", () => {
    const schema = pvl.object({ name: pvl.string().transform((value) => value.length) });
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema.shape.name>>().toEqualTypeOf<string>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema.shape.name>>().toEqualTypeOf<number>();
  });

  it('types a nested composite reached through shape as its own composite class', () => {
    const schema = pvl.object({
      user: pvl.object({ city: pvl.string() }),
      tags: pvl.array(pvl.number()),
    });
    expectTypeOf(schema.shape.user.shape.city).toEqualTypeOf<StringSchema>();
    expectTypeOf(schema.shape.tags.element).toEqualTypeOf<NumberSchema>();
  });

  it('keeps shape typed through .strict(), .passthrough() and the base modifiers', () => {
    const base = pvl.object({ name: pvl.string() });
    expectTypeOf(base.strict().shape.name).toEqualTypeOf<StringSchema>();
    expectTypeOf(base.passthrough().shape.name).toEqualTypeOf<StringSchema>();
    expectTypeOf(base.optional().shape.name).toEqualTypeOf<StringSchema>();
    expectTypeOf(base.nullable().shape.name).toEqualTypeOf<StringSchema>();
    expectTypeOf(base.refine(() => true).shape.name).toEqualTypeOf<StringSchema>();
    expectTypeOf(base.transform((value) => value.name).shape.name).toEqualTypeOf<StringSchema>();
  });

  it("types element as the item's own schema class", () => {
    const schema = pvl.array(pvl.string());
    expectTypeOf(schema.element).toEqualTypeOf<StringSchema>();
  });

  it("infers the item's own input/output through element", () => {
    const schema = pvl.array(pvl.string().transform((value) => value.length));
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema.element>>().toEqualTypeOf<string>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema.element>>().toEqualTypeOf<number>();
  });

  it('keeps element typed through the length constraints and the base modifiers', () => {
    const base = pvl.array(pvl.string());
    expectTypeOf(base.min(1).element).toEqualTypeOf<StringSchema>();
    expectTypeOf(base.max(5).element).toEqualTypeOf<StringSchema>();
    expectTypeOf(base.length(2).element).toEqualTypeOf<StringSchema>();
    expectTypeOf(base.optional().element).toEqualTypeOf<StringSchema>();
    expectTypeOf(base.nullable().element).toEqualTypeOf<StringSchema>();
    expectTypeOf(base.refine(() => true).element).toEqualTypeOf<StringSchema>();
    expectTypeOf(base.transform((value) => value.length).element).toEqualTypeOf<StringSchema>();
  });
});
