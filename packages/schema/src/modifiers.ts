// The `Modifier` type every schema's pipeline runs (ADR-0010) and the tags
// that describe one. A Modifier itself lives with the schema class that
// builds it. Internal-only, so it stays out of the barrel.
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
  fn: (value: Input, path: ReadonlyArray<PropertyKey>) => Result<Output> | null;
  tags?: ReadonlyArray<ModifierTag>;
  // The factory that built this modifier, so `_withoutModifiers` can remove
  // every modifier of that shape whichever instance a schema holds. Left out
  // on a modifier nothing ever removes.
  shape?: ModifierShape;
};

// A function that builds modifiers; its identity is the shape it stamps on
// each one.
export type ModifierShape = (...args: never[]) => Modifier<unknown, unknown>;
