import { describe, expect, it } from 'vitest'
import { pvl } from '../src/index.js'
import { assertSuccess } from './helpers.js'

const SYSTEM_ROLE = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const

const HTTP_STATUS = {
  OK_200: 200,
  NOT_FOUND_404: 404,
} as const

describe('pvl.enum()', () => {
  describe('`as const` object source', () => {
    it("accepts one of the object's values", () => {
      const result = pvl.enum(SYSTEM_ROLE).validate('MEMBER')
      assertSuccess(result)
      expect(result.value).toBe('MEMBER')
    })

    it("rejects a value that is not one of the object's values", () => {
      const result = pvl.enum(SYSTEM_ROLE).validate('ADMIN')
      expect(result.issues).toBeDefined()
    })

    it("rejects one of the object's keys when it is not also a value", () => {
      const result = pvl.enum(HTTP_STATUS).validate('OK_200')
      expect(result.issues).toBeDefined()
    })

    it('accepts a numeric value from a numeric enum object', () => {
      const result = pvl.enum(HTTP_STATUS).validate(404)
      assertSuccess(result)
      expect(result.value).toBe(404)
    })

    it('rejects the string form of a numeric value', () => {
      const result = pvl.enum(HTTP_STATUS).validate('404')
      expect(result.issues).toBeDefined()
    })
  })

  describe('string-literal array source', () => {
    it('accepts a member of the array', () => {
      const result = pvl.enum(['A', 'B']).validate('B')
      assertSuccess(result)
      expect(result.value).toBe('B')
    })

    it('rejects a non-member', () => {
      const result = pvl.enum(['A', 'B']).validate('C')
      expect(result.issues).toBeDefined()
    })

    it('rejects a non-string', () => {
      const result = pvl.enum(['A', 'B']).validate(0)
      expect(result.issues).toBeDefined()
    })

    it('rejects undefined when the schema is not optional', () => {
      const result = pvl.enum(['A', 'B']).validate(undefined)
      expect(result.issues).toBeDefined()
    })
  })

  it('uses a custom message for the enum check', () => {
    const result = pvl.enum(SYSTEM_ROLE, { message: 'unknown role' }).validate('ADMIN')
    expect(result.issues?.[0]?.message).toBe('unknown role')
  })

  it('reports a top-level Issue with no path for a bare enum failure', () => {
    const result = pvl.enum(SYSTEM_ROLE).validate('ADMIN')
    expect(result.issues?.[0]?.message).toBeTypeOf('string')
    expect(result.issues?.[0]?.code).toBe('INVALID_VALUE')
    expect(result.issues?.[0]?.path).toBeUndefined()
  })

  describe('inherited modifiers', () => {
    it('accepts undefined once .optional() is applied', () => {
      const result = pvl.enum(SYSTEM_ROLE).optional().validate(undefined)
      assertSuccess(result)
      expect(result.value).toBeUndefined()
    })

    it('accepts null once .nullable() is applied', () => {
      const result = pvl.enum(SYSTEM_ROLE).nullable().validate(null)
      assertSuccess(result)
      expect(result.value).toBeNull()
    })

    it('runs a .refine() predicate after the enum check', () => {
      const schema = pvl
        .enum(SYSTEM_ROLE)
        .refine((value) => value === 'OWNER', { message: 'owners only' })
      expect(schema.validate('MEMBER').issues?.[0]?.message).toBe('owners only')
      expect(schema.validate('OWNER').issues).toBeUndefined()
    })

    it('applies a .transform() to the accepted value', () => {
      const result = pvl
        .enum(SYSTEM_ROLE)
        .transform((value) => value.toLowerCase())
        .validate('OWNER')
      assertSuccess(result)
      expect(result.value).toBe('owner')
    })

    it('is chainable through .coerce() without changing the accepted values', () => {
      const schema = pvl.enum(SYSTEM_ROLE).coerce()
      expect(schema.validate('OWNER').issues).toBeUndefined()
      expect(schema.validate('ADMIN').issues).toBeDefined()
    })

    it('exposes Standard Schema conformance', () => {
      const schema = pvl.enum(SYSTEM_ROLE)
      expect(schema['~standard'].version).toBe(1)
      expect(schema['~standard'].vendor).toBe('@pvl/schema')
      expect(schema['~standard'].validate('OWNER')).toEqual({
        value: 'OWNER',
      })
    })
  })
})
