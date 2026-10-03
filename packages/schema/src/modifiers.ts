// The `Modifier` type every schema's pipeline runs (ADR-0010), and the
// Modifiers that are not a method's inline literal: `object`'s unknown-key
// handling. Internal-only, so it stays out of the barrel.
import type { ValueOfEnum } from '@repo/types';
import { ISSUE_CODE, Issue, type IssueEditableProps } from './issue.js';
import type { Result } from './result.js';
import { assignObjectProperty, unknownKeysOfObject } from './utils.js';

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

// The unknown-key modifiers run as post-modifiers, once `_checkType` has
// accepted the value. `_checkType` keeps every key, so the undeclared ones are
// still on the value; no post-modifier replaces it before them (`.refine()`
// and `.strict()` only report).

// The default: every object schema starts with it as its first post-modifier,
// and `.strict()`/`.passthrough()` remove it.
export const unknownKeysStripModifier = (
  declaredKeys: ReadonlySet<string>,
): Modifier<unknown, unknown> => ({
  shape: unknownKeysStripModifier,
  fn: (value) => {
    if (unknownKeysOfObject(value, declaredKeys).length === 0) {
      return null;
    }
    const input = value as Record<string, unknown>;
    // Copied rather than deleted in place, so a value an earlier step handed
    // on is never mutated.
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input)) {
      if (declaredKeys.has(key)) {
        assignObjectProperty(output, key, input[key]);
      }
    }
    return { value: output };
  },
});

export const unknownKeysStrictModifier = (
  declaredKeys: ReadonlySet<string>,
  options?: IssueEditableProps,
): Modifier<unknown, unknown> => ({
  shape: unknownKeysStrictModifier,
  fn: (value, path) => {
    const issues = unknownKeysOfObject(value, declaredKeys).map(
      (key) =>
        new Issue(
          ISSUE_CODE.UNRECOGNIZED_KEY,
          [...path, key],
          options?.message ?? `Unrecognized key "${key}"`,
        ),
    );
    return issues.length > 0 ? { issues } : null;
  },
});

// Every unknown-key modifier, removed by `.strict()` and `.passthrough()` so
// the last one chained wins. `.passthrough()` adds none of its own: without
// the strip modifier, `_checkType`'s output already keeps every key.
export const UNKNOWN_KEYS_MODIFIERS = [unknownKeysStripModifier, unknownKeysStrictModifier];
