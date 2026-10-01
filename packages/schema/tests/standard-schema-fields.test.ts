import { describe, expect, expectTypeOf, it } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import {
  ISSUE_CODE,
  pvl,
  VENDOR,
  type Issue,
  type PvlStandardSchema,
  type Result,
} from '../src/index.js';
import { assertSuccess } from './helpers.js';

// A Standard Schema object built by hand rather than by a `pvl.*` factory —
// the shape a Compiled Schema has: no `@pvl/schema` class behind it, only a
// `"~standard"` reporting this library's vendor. It accepts an even number and
// reports a failure nested one level down, so path re-prefixing is visible.
const notEven: Issue = {
  code: ISSUE_CODE.CUSTOM,
  message: 'Expected an even number',
  path: ['inner'],
};

const evenNumber: PvlStandardSchema<number, number> = {
  '~standard': {
    version: 1,
    vendor: VENDOR,
    validate: (value: unknown): Result<number> =>
      typeof value === 'number' && value % 2 === 0 ? { value } : { issues: [notEven] },
  },
};

describe('a pvl Standard Schema as a composite field', () => {
  it('accepts a valid value through an object field', () => {
    const schema = pvl.object({ count: evenNumber });
    const result = schema.validate({ count: 4 });
    assertSuccess(result);
    expect(result.value).toEqual({ count: 4 });
  });

  it("prefixes the field's key onto the path of each Issue it reports", () => {
    const schema = pvl.object({ count: evenNumber });
    expect(schema.validate({ count: 3 }).issues).toEqual([
      { code: 'CUSTOM', message: 'Expected an even number', path: ['count', 'inner'] },
    ]);
  });

  it('reports the full path from the outermost schema two levels down', () => {
    const schema = pvl.object({ outer: pvl.object({ count: evenNumber }) });
    expect(schema.validate({ outer: { count: 3 } }).issues?.[0]?.path).toEqual([
      'outer',
      'count',
      'inner',
    ]);
  });

  it("gives an Issue reported at the child's own root exactly the parent key as its path", () => {
    const schema = pvl.object({ address: pvl.object({ city: pvl.string() }).refine(() => false) });
    const nested = pvl.object({ address: { '~standard': schema.shape.address['~standard'] } });
    expect(nested.validate({ address: { city: 'x' } }).issues).toEqual([
      { code: 'CUSTOM', message: 'Invalid value', path: ['address'] },
    ]);
  });

  it('accepts a valid value through an array element, prefixing each failing index', () => {
    const schema = pvl.array(evenNumber);
    expect(schema.validate([2, 4]).issues).toBeUndefined();
    expect(schema.validate([2, 3, 5]).issues?.map((issue) => issue.path)).toEqual([
      [1, 'inner'],
      [2, 'inner'],
    ]);
  });

  it("validates a union member at the union's own path", () => {
    const schema = pvl.object({ id: pvl.union([pvl.string(), evenNumber]) });
    expect(schema.validate({ id: 4 }).issues).toBeUndefined();
    expect(schema.validate({ id: 3 }).issues?.map((issue) => issue.path)).toEqual([
      ['id'],
      ['id', 'inner'],
    ]);
  });

  it('hands back its Issues unchanged when it is a union member at the root', () => {
    const schema = pvl.union([pvl.string(), evenNumber]);
    expect(schema.validate(4).issues).toBeUndefined();
    expect(schema.validate(3).issues).toEqual([
      { code: 'INVALID_TYPE', message: 'Expected string' },
      { code: 'CUSTOM', message: 'Expected an even number', path: ['inner'] },
    ]);
  });

  describe('type level', () => {
    // Shaped exactly like a pvl Standard Schema except for its vendor — what
    // another Standard Schema library hands out.
    const foreign: StandardSchemaV1<number> = {
      '~standard': {
        version: 1,
        vendor: 'zod',
        validate: (value: unknown) => ({ value: value as number }),
      },
    };

    it("types every pvl schema's vendor as the '@pvl/schema' literal", () => {
      expectTypeOf(pvl.string()['~standard'].vendor).toEqualTypeOf<'@pvl/schema'>();
      expectTypeOf(pvl.object({})['~standard'].vendor).toEqualTypeOf<'@pvl/schema'>();
    });

    it('infers object input and output through a pvl Standard Schema field', () => {
      const schema = pvl.object({ count: evenNumber });
      expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<{
        count: number;
      }>();
      expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<{
        count: number;
      }>();
    });

    it('infers array input and output through a pvl Standard Schema element', () => {
      const schema = pvl.array(evenNumber);
      expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<number[]>();
      expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number[]>();
    });

    it('infers union input and output through a pvl Standard Schema member', () => {
      const schema = pvl.union([pvl.string(), evenNumber]);
      expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string | number>();
      expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string | number>();
    });

    it('rejects a Standard Schema from another library as an object field', () => {
      // @ts-expect-error only a Standard Schema this library produced is a field
      pvl.object({ count: foreign });
    });

    it('rejects a Standard Schema from another library as an array element', () => {
      // @ts-expect-error only a Standard Schema this library produced is an element
      pvl.array(foreign);
    });

    it('rejects a Standard Schema from another library as a union member', () => {
      // @ts-expect-error only a Standard Schema this library produced is a member
      pvl.union([pvl.string(), foreign]);
    });
  });

  it('collects its Issues alongside every other failing field', () => {
    const schema = pvl.object({ name: pvl.string(), count: evenNumber, flag: pvl.boolean() });
    expect(
      schema.validate({ name: 1, count: 3, flag: 'yes' }).issues?.map((issue) => issue.path),
    ).toEqual([['name'], ['count', 'inner'], ['flag']]);
  });
});
