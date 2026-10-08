// The tags that describe how a Modifier departs from the default reading of
// its result. Internal-only, like the rest of this directory.
import type { ValueOfEnum } from '@repo/types';

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
