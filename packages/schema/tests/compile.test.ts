import { describe, expect, it } from 'vitest';
import { pvl } from '../src/index.js';

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
});
