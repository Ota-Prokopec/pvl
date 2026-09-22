import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { pvl } from '../src/index.js'
import { assertSuccess } from './helpers.js'

describe('pvl.union()', () => {
  it('accepts a value matching the first alternative', () => {
    const schema = pvl.union([pvl.string(), pvl.number(), pvl.boolean()])
    const result = schema.validate('hello')
    assertSuccess(result)
    expect(result.value).toBe('hello')
  })

  it('accepts a value matching a later alternative', () => {
    const schema = pvl.union([pvl.string(), pvl.number(), pvl.boolean()])
    expect(schema.validate(42).issues).toBeUndefined()
    expect(schema.validate(true).issues).toBeUndefined()
  })

  it('rejects a value matching no alternative', () => {
    const schema = pvl.union([pvl.string(), pvl.number(), pvl.boolean()])
    const result = schema.validate({ nope: true })
    expect(result.issues).toBeDefined()
  })

  it('tries every alternative rather than a discriminant-based dispatch', () => {
    const schema = pvl.union([
      pvl.object({ kind: pvl.literal('a'), value: pvl.string() }),
      pvl.object({ kind: pvl.literal('b'), value: pvl.number() }),
    ])
    expect(schema.validate({ kind: 'a', value: 'hi' }).issues).toBeUndefined()
    expect(schema.validate({ kind: 'b', value: 1 }).issues).toBeUndefined()
    expect(schema.validate({ kind: 'b', value: 'wrong type' }).issues).toBeDefined()
  })

  it('uses a custom message when no alternative matches', () => {
    const schema = pvl.union([pvl.string(), pvl.number()], {
      message: 'must be a string or number',
    })
    const result = schema.validate(true)
    expect(result.issues?.[0]?.message).toBe('must be a string or number')
  })

  describe('inherited modifiers', () => {
    it('accepts undefined once .optional()', () => {
      const schema = pvl.union([pvl.string(), pvl.number()]).optional()
      const result = schema.validate(undefined)
      assertSuccess(result)
      expect(result.value).toBeUndefined()
    })

    it('accepts null once .nullable()', () => {
      const schema = pvl.union([pvl.string(), pvl.number()]).nullable()
      const result = schema.validate(null)
      assertSuccess(result)
      expect(result.value).toBeNull()
    })

    it('runs a .refine() predicate after a member accepts the value', () => {
      const schema = pvl
        .union([pvl.string(), pvl.number()])
        .refine((value) => value !== 'forbidden', {
          message: 'value is forbidden',
        })
      expect(schema.validate('ok').issues).toBeUndefined()
      expect(schema.validate('forbidden').issues?.[0]?.message).toBe('value is forbidden')
    })

    it('applies a .transform() to the accepted value', () => {
      const schema = pvl.union([pvl.string(), pvl.number()]).transform((value) => String(value))
      const result = schema.validate(42)
      assertSuccess(result)
      expect(result.value).toBe('42')
    })

    it("lets a member's own .coerce() apply during that member's own attempt", () => {
      const schema = pvl.union([pvl.boolean(), pvl.number().coerce()])
      const result = schema.validate('42')
      assertSuccess(result)
      expect(result.value).toBe(42)
    })

    it('exposes Standard Schema conformance', () => {
      const schema = pvl.union([pvl.string(), pvl.number()])
      expect(schema['~standard'].version).toBe(1)
      expect(schema['~standard'].vendor).toBe('@pvl/schema')
      expect(schema['~standard'].validate('hi')).toEqual({ value: 'hi' })
    })
  })

  describe('nested Issue shape (seam 4)', () => {
    it("collects every member's own rejection rather than one generic Issue", () => {
      const schema = pvl.union([pvl.string(), pvl.number()])
      const result = schema.validate(true)
      expect(result.issues).toEqual([
        { code: 'INVALID_TYPE', message: 'Expected string' },
        { code: 'INVALID_TYPE', message: 'Expected number' },
      ])
    })

    it('uses a single custom-message Issue instead of collected rejections', () => {
      const schema = pvl.union([pvl.string(), pvl.number()], {
        message: 'must be a string or number',
      })
      const result = schema.validate(true)
      expect(result.issues).toEqual([
        {
          code: 'INVALID_UNION',
          message: 'must be a string or number',
        },
      ])
    })

    it('paths every collected rejection to the field the union occupies inside an object', () => {
      const schema = pvl.object({
        id: pvl.union([pvl.string(), pvl.number()]),
      })
      const result = schema.validate({ id: true })
      expect(result.issues).toEqual([
        { code: 'INVALID_TYPE', message: 'Expected string', path: ['id'] },
        { code: 'INVALID_TYPE', message: 'Expected number', path: ['id'] },
      ])
    })
  })
})

describe('pvl.union() (property-based)', () => {
  it('accepts any value that matches at least one member', () => {
    const schema = pvl.union([pvl.string(), pvl.number()])
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.double({ noNaN: true })),
        (value) => schema.validate(value).issues === undefined,
      ),
    )
  })

  it('rejects values matching none of the members', () => {
    const schema = pvl.union([pvl.string(), pvl.number()])
    fc.assert(fc.property(fc.boolean(), (value) => schema.validate(value).issues !== undefined))
  })
})
