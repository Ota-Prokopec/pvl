import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ValueOfEnum } from '@repo/types';
import type { Result } from './result.js';

// How a Modifier departs from the default reading of its `fn` result (`null`
// continue, `{ issues }` collect and continue, `{ value }` replace and
// continue), declared where the Modifier is built rather than special-cased in
// `Schema._validate` — see ADR-0010.
export const MODIFIER_TAG = {
  // A `{ value }` means "valid": accept it and skip every remaining
  // pre-modifier, the type check and every post-modifier.
  SHORT_CIRCUIT: 'SHORT_CIRCUIT',
  // Runs only if no Issue has been collected so far.
  REQUIRES_ALL_PASSED: 'REQUIRES_ALL_PASSED',
  // Still runs after a SHORT_CIRCUIT step has accepted the value.
  RUNS_AFTER_SHORT_CIRCUIT: 'RUNS_AFTER_SHORT_CIRCUIT',
} as const;

export type ModifierTag = ValueOfEnum<typeof MODIFIER_TAG>;

export type Modifier<Input, Output> = {
  // `input` is the value the type check received, before any post-modifier
  // replaced it, for a post-modifier that has to read back what `_checkType`
  // dropped (`object`'s `.passthrough()`).
  fn: (value: Input, path: ReadonlyArray<PropertyKey>, input: unknown) => Result<Output> | null;
  tags?: ReadonlyArray<ModifierTag>;
  // The factory that built this modifier, so `_withoutModifiers` can remove
  // every modifier of that shape whichever instance a schema holds. Left out
  // on a modifier nothing ever removes.
  shape?: ModifierShape;
};

// A function that builds modifiers; its identity is the shape it stamps on
// each one.
export type ModifierShape = (...args: never[]) => Modifier<unknown, unknown>;

export type InferInput<TSchema extends StandardSchemaV1> = StandardSchemaV1.InferInput<TSchema>;
export type InferOutput<TSchema extends StandardSchemaV1> = StandardSchemaV1.InferOutput<TSchema>;
