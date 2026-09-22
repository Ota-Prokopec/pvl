import { describe, expectTypeOf, it } from 'vitest'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ValueOfEnum } from '@repo/types'
import { pvl } from '../src/index.js'

const SYSTEM_ROLE = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const

const HTTP_STATUS = {
  OK_200: 200,
  NOT_FOUND_404: 404,
} as const

describe('type inference', () => {
  it("infers pvl.string()'s input/output as string", () => {
    const schema = pvl.string()
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string>()
  })

  it("infers a transformed pvl.string()'s differing input/output", () => {
    const schema = pvl.string().transform((value) => value.length)
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number>()
  })

  it("infers pvl.number()'s input/output as number", () => {
    const schema = pvl.number()
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<number>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number>()
  })

  it("infers a transformed pvl.number()'s differing input/output", () => {
    const schema = pvl.number().transform((value) => value.toFixed(2))
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<number>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string>()
  })

  it("infers pvl.boolean()'s input/output as boolean", () => {
    const schema = pvl.boolean()
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<boolean>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<boolean>()
  })

  it("infers a transformed pvl.boolean()'s differing input/output", () => {
    const schema = pvl.boolean().transform((value): number => (value ? 1 : 0))
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<boolean>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number>()
  })

  it("infers pvl.bigint()'s input/output as bigint", () => {
    const schema = pvl.bigint()
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<bigint>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<bigint>()
  })

  it("infers a transformed pvl.bigint()'s differing input/output", () => {
    const schema = pvl.bigint().transform((value) => value.toString())
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<bigint>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string>()
  })
  it("infers pvl.literal()'s input/output as the literal type", () => {
    const schema = pvl.literal('OWNER')
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<'OWNER'>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<'OWNER'>()
  })

  it("infers a numeric pvl.literal()'s input/output as the literal type", () => {
    const schema = pvl.literal(42)
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<42>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<42>()
  })

  it("infers pvl.enum()'s input/output from an `as const` object via ValueOfEnum", () => {
    const schema = pvl.enum(SYSTEM_ROLE)
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<
      ValueOfEnum<typeof SYSTEM_ROLE>
    >()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<'OWNER' | 'MEMBER'>()
  })

  it("infers pvl.enum()'s input/output from a string-literal array", () => {
    const schema = pvl.enum(['A', 'B'])
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<'A' | 'B'>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<'A' | 'B'>()
  })

  it("infers a numeric enum object's values, not its keys", () => {
    const schema = pvl.enum(HTTP_STATUS)
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<
      ValueOfEnum<typeof HTTP_STATUS>
    >()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<200 | 404>()
  })

  it("infers pvl.object()'s input/output as the composed object type", () => {
    const schema = pvl.object({ name: pvl.string(), age: pvl.number() })
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<{
      name: string
      age: number
    }>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      name: string
      age: number
    }>()
  })

  it('infers an .optional() field as an optional key', () => {
    const schema = pvl.object({
      name: pvl.string(),
      nickname: pvl.string().optional(),
    })
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      name: string
      nickname?: string | undefined
    }>()
  })

  it('infers a .nullable() field as a required key that may be null', () => {
    const schema = pvl.object({ nickname: pvl.string().nullable() })
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      nickname: string | null
    }>()
  })

  it('infers an .optional().nullable() field as an optional, nullable key', () => {
    const schema = pvl.object({ nickname: pvl.string().optional().nullable() })
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      nickname?: string | null | undefined
    }>()
  })

  it("infers a nested pvl.object()'s composed type", () => {
    const schema = pvl.object({
      user: pvl.object({ name: pvl.string() }),
    })
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      user: { name: string }
    }>()
  })

  it("infers a transformed field's differing input/output", () => {
    const schema = pvl.object({
      name: pvl.string().transform((value) => value.length),
    })
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<{
      name: string
    }>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      name: number
    }>()
  })

  it("infers .passthrough()'s output as the known keys plus untyped unknown ones", () => {
    const schema = pvl.object({ name: pvl.string() }).passthrough()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<
      { name: string } & Record<string, unknown>
    >()
  })

  it("infers .strict()'s output as the known keys only", () => {
    const schema = pvl.object({ name: pvl.string() }).strict()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
      name: string
    }>()
  })

  it("infers a transformed pvl.enum()'s differing input/output", () => {
    const schema = pvl.enum(SYSTEM_ROLE).transform((value) => value.length)
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<'OWNER' | 'MEMBER'>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number>()
  })

  it("infers a pvl.union()'s input/output as the union of its members' types", () => {
    const schema = pvl.union([pvl.string(), pvl.number(), pvl.boolean()])
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<
      string | number | boolean
    >()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<
      string | number | boolean
    >()
  })

  it("infers a pvl.union()'s differing input/output when a member has a .transform()", () => {
    const schema = pvl.union([pvl.string(), pvl.number().transform((value) => value.toFixed(2))])
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string | number>()
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string>()
  })
})
