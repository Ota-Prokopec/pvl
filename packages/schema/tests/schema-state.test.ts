import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, resolveShortCircuit, runSteps } from '../src/schemas/schemaState.js';
import type { RefineStep, SchemaState, TransformStep } from '../src/schemas/schemaState.js';
import { assertSuccess } from './helpers.js';

describe('resolveShortCircuit()', () => {
  it('short-circuits on undefined input when isOptional is true', () => {
    const state: SchemaState = { ...DEFAULT_STATE, isOptional: true };
    const result = resolveShortCircuit({ state, input: undefined });
    expect(result).toBeDefined();
    assertSuccess(result!);
    expect(result!.value).toBeUndefined();
  });

  it('short-circuits on null input when isNullable is true', () => {
    const state: SchemaState = { ...DEFAULT_STATE, isNullable: true };
    const result = resolveShortCircuit({ state, input: null });
    expect(result).toBeDefined();
    assertSuccess(result!);
    expect(result!.value).toBeNull();
  });

  it('falls through (returns undefined) when neither applies', () => {
    const state: SchemaState = { ...DEFAULT_STATE, isOptional: true, isNullable: true };
    expect(resolveShortCircuit({ state, input: 'hello' })).toBeUndefined();
  });

  it('does not short-circuit undefined when isOptional is false', () => {
    const state: SchemaState = { ...DEFAULT_STATE, isNullable: true };
    expect(resolveShortCircuit({ state, input: undefined })).toBeUndefined();
  });

  it('does not short-circuit null when isNullable is false', () => {
    const state: SchemaState = { ...DEFAULT_STATE, isOptional: true };
    expect(resolveShortCircuit({ state, input: null })).toBeUndefined();
  });

  it('resolves against the post-coercion value, since coercion runs before this is called', () => {
    const state: SchemaState = { ...DEFAULT_STATE, isNullable: true, shouldCoerce: true };
    const coerce = (value: unknown): unknown => (value === '' ? null : value);
    const coerced = coerce('');
    const result = resolveShortCircuit({ state, input: coerced });
    expect(result).toBeDefined();
    assertSuccess(result!);
    expect(result!.value).toBeNull();
  });
});

describe('runSteps()', () => {
  it('returns the value unchanged when there are no steps', () => {
    const result = runSteps({ steps: [], value: 'abc', path: [] });
    assertSuccess(result);
    expect(result.value).toBe('abc');
  });

  it('applies an ordered mix of refine/transform steps in exact call order', () => {
    const refineStartsWithA: RefineStep = {
      kind: 'refine',
      predicate: (value) => typeof value === 'string' && value.startsWith('a'),
    };
    const transformUppercase: TransformStep = {
      kind: 'transform',
      fn: (value) => (value as string).toUpperCase(),
    };
    const refineObservesTransform: RefineStep = {
      kind: 'refine',
      predicate: (value) => value === (value as string).toUpperCase(),
    };

    const result = runSteps({
      steps: [refineStartsWithA, transformUppercase, refineObservesTransform],
      value: 'abc',
      path: [],
    });
    assertSuccess(result);
    expect(result.value).toBe('ABC');
  });

  it('a failing refine short-circuits the remaining steps', () => {
    const failingRefine: RefineStep = { kind: 'refine', predicate: () => false };
    const transformThatShouldNotRun: TransformStep = {
      kind: 'transform',
      fn: () => {
        throw new Error('should not run after a failing refine');
      },
    };

    const result = runSteps({
      steps: [failingRefine, transformThatShouldNotRun],
      value: 'abc',
      path: [],
    });
    expect(result.issues).toBeDefined();
  });

  it("uses a failing refine step's custom message", () => {
    const failingRefine: RefineStep = {
      kind: 'refine',
      predicate: () => false,
      options: { message: 'custom failure' },
    };
    const result = runSteps({ steps: [failingRefine], value: 'abc', path: [] });
    expect(result.issues?.[0]?.message).toBe('custom failure');
  });

  it('attributes a failing refine to the given path', () => {
    const failingRefine: RefineStep = { kind: 'refine', predicate: () => false };
    const result = runSteps({ steps: [failingRefine], value: 'abc', path: ['field'] });
    expect(result.issues?.[0]?.path).toEqual(['field']);
  });
});
