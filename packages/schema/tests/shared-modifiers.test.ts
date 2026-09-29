import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODIFIERS,
  resolveShortCircuit,
  runSteps,
} from '../src/schemas/sharedModifiers.js';
import type { RefineStep, SharedModifiers, TransformStep } from '../src/schemas/sharedModifiers.js';
import { assertSuccess } from './helpers.js';

describe('resolveShortCircuit()', () => {
  it('short-circuits on undefined input when isOptional is true', () => {
    const modifiers: SharedModifiers = { ...DEFAULT_MODIFIERS, isOptional: true };
    const result = resolveShortCircuit({ modifiers, input: undefined });
    expect(result).toBeDefined();
    assertSuccess(result!);
    expect(result!.value).toBeUndefined();
  });

  it('short-circuits on null input when isNullable is true', () => {
    const modifiers: SharedModifiers = { ...DEFAULT_MODIFIERS, isNullable: true };
    const result = resolveShortCircuit({ modifiers, input: null });
    expect(result).toBeDefined();
    assertSuccess(result!);
    expect(result!.value).toBeNull();
  });

  it('falls through (returns undefined) when neither applies', () => {
    const modifiers: SharedModifiers = { ...DEFAULT_MODIFIERS, isOptional: true, isNullable: true };
    expect(resolveShortCircuit({ modifiers, input: 'hello' })).toBeUndefined();
  });

  it('does not short-circuit undefined when isOptional is false', () => {
    const modifiers: SharedModifiers = { ...DEFAULT_MODIFIERS, isNullable: true };
    expect(resolveShortCircuit({ modifiers, input: undefined })).toBeUndefined();
  });

  it('does not short-circuit null when isNullable is false', () => {
    const modifiers: SharedModifiers = { ...DEFAULT_MODIFIERS, isOptional: true };
    expect(resolveShortCircuit({ modifiers, input: null })).toBeUndefined();
  });

  it('resolves against the post-coercion value, since coercion runs before this is called', () => {
    const modifiers: SharedModifiers = {
      ...DEFAULT_MODIFIERS,
      isNullable: true,
      shouldCoerce: true,
    };
    const coerce = (value: unknown): unknown => (value === '' ? null : value);
    const coerced = coerce('');
    const result = resolveShortCircuit({ modifiers, input: coerced });
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
