import { describe, expect, it, vi } from 'vitest';
import { pvl, type Issue } from '../src/index.js';
import { assertSuccess, issueCodes } from './helpers.js';

// Whether `value` is even: the `.refine()` predicate the pipeline cases
// chain, so a case can tell whether the refinement ran (`isEven(2.5)` is
// false, and fails the refinement) or was skipped.
const isEven = (value: number): boolean => value % 2 === 0;

// The reference cases for `Schema._validate`'s steps (ADR-0010): pre-modifiers
// and post-modifiers each run in chain order around the type check, every
// Issue is collected, and a short-circuit skips everything but a Transform.
describe('the modifier pipeline', () => {
  it('collects every failing Constraint rather than stopping at the first', () => {
    const result = pvl.string().min(5).length(3).validate('ab');
    expect(issueCodes(result)).toEqual(['TOO_SMALL', 'INVALID_LENGTH']);
  });

  it('runs no post-modifier once the type check fails', () => {
    const result = pvl.string().min(5).validate(42);
    expect(issueCodes(result)).toEqual(['INVALID_TYPE']);
  });

  it('runs no composite Constraint once a child fails, reporting every failing child', () => {
    const result = pvl.array(pvl.string()).max(2).validate(['a', 2, 3]);
    expect(result.issues?.map((issue: Issue) => [issue.path, issue.code])).toEqual([
      [[1], 'INVALID_TYPE'],
      [[2], 'INVALID_TYPE'],
    ]);
  });

  it('runs no .strict() once a field fails', () => {
    const result = pvl.object({ a: pvl.string() }).strict().validate({ a: 1, b: 2 });
    expect(result.issues?.map((issue: Issue) => [issue.path, issue.code])).toEqual([
      [['a'], 'INVALID_TYPE'],
    ]);
  });

  it('reports an undeclared key under .strict() once every field passes', () => {
    const result = pvl.object({ a: pvl.string() }).strict().validate({ a: 'x', b: 2 });
    expect(result.issues?.map((issue: Issue) => [issue.path, issue.code])).toEqual([
      [['b'], 'UNRECOGNIZED_KEY'],
    ]);
  });

  it('collects a Refinement and a Constraint in chain order', () => {
    const result = pvl.number().refine(isEven, { message: 'must be even' }).int().validate(2.5);
    expect(result.issues?.map((issue: Issue) => [issue.code, issue.message])).toEqual([
      ['CUSTOM', 'must be even'],
      ['NOT_INTEGER', 'Number must be an integer'],
    ]);
  });

  it('coerces before .optional() can short-circuit when chained first', () => {
    const result = pvl.string().coerce().optional().validate(undefined);
    assertSuccess(result);
    expect(result.value).toBe('undefined');
  });

  it('short-circuits before .coerce() runs when .optional() is chained first', () => {
    const result = pvl.string().optional().coerce().validate(undefined);
    assertSuccess(result);
    expect(result.value).toBeUndefined();
  });

  it('still runs a .transform() after .nullable() short-circuits', () => {
    const transform = vi.fn((value: string | null) => (value === null ? 'none' : value));
    const result = pvl.string().nullable().transform(transform).validate(null);
    assertSuccess(result);
    expect(transform).toHaveBeenCalledWith(null);
    expect(result.value).toBe('none');
  });

  it('skips a .refine() after .nullable() short-circuits', () => {
    const predicate = vi.fn((): boolean => false);
    const result = pvl.string().nullable().refine(predicate).validate(null);
    assertSuccess(result);
    expect(result.value).toBeNull();
    expect(predicate).not.toHaveBeenCalled();
  });

  it('lets a .refine() chained after .passthrough() see the undeclared keys', () => {
    const schema = pvl
      .object({ id: pvl.string() })
      .passthrough()
      .refine((value) => 'meta' in value);
    expect(schema.validate({ id: 'a', meta: 1 }).issues).toBeUndefined();
  });

  it('lets a .refine() chained before .passthrough() see the undeclared keys too', () => {
    const schema = pvl
      .object({ id: pvl.string() })
      .refine((value) => 'meta' in value)
      .passthrough();
    expect(schema.validate({ id: 'a', meta: 1 }).issues).toBeUndefined();
  });

  it('runs a .refine() on the stripped value by default', () => {
    const schema = pvl.object({ id: pvl.string() }).refine((value) => 'meta' in value);
    expect(issueCodes(schema.validate({ id: 'a', meta: 1 }))).toEqual(['CUSTOM']);
  });

  it('skips a .transform() once any Issue has been collected', () => {
    const transform = vi.fn((value: string) => value.length);
    const result = pvl.string().min(5).transform(transform).validate('ab');
    expect(issueCodes(result)).toEqual(['TOO_SMALL']);
    expect(transform).not.toHaveBeenCalled();
  });
});
