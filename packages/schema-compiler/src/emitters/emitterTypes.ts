// The shapes an emitter method mirroring a Schema method reads and hands
// back, and the type that ties its arguments to that Schema method's own.

import type { EmittedIssue } from '../types.js';

/** A Modifier method input: what an emitter method reads, the value it checks and the Issue path it reports at, each as an expression. */
export type CheckingTarget = {
  /** The checked value, as an expression: `value`, `field0`, `element`. */
  value: string;
  /** The full `path` of an Issue reported for it, as an expression: `[...path, "name"]`, not just the key. */
  issuePath: string;
};

/** A Modifier method output: one check, the condition it fails under, and the Issue literal it reports then. */
export type Check = {
  failsWhen: string;
  issue: EmittedIssue;
};

/** A pre-modifier method output: the condition under which a value skips every other check, as `.optional()` lets `undefined` through. */
export type ShortCircuitCondition = {
  shortCircuitsWhen: string;
};

/** What an emitter method writes: a check, a pre-modifier's short-circuit condition, or source text, as `.strict()`'s loop. */
export type EmitterMethodOutput = Check | ShortCircuitCondition | string;

/**
 * The type of an emitter method mirroring `TSchemaMethod`, a method of the
 * `@pvl/schema` schema it compiles. It takes one object: the target, and
 * that method's own parameters as `args`, so the two can't drift apart.
 * Returns a check, or `TOutput` for a method that writes a short-circuit
 * condition or source text instead; a composite's method reads a wider
 * `TInput`.
 *
 * ```ts
 * EmitterMethodOf<StringSchema['min']>
 * // (input: { target: CheckingTarget; args: [minLength: number, options?: IssueEditableProps] }) => Check
 * EmitterMethodOf<ChainableSchema['optional'], ShortCircuitCondition> // (input: { target: CheckingTarget; args: [] }) => ShortCircuitCondition
 * EmitterMethodOf<ObjectSchema['strict'], string, ObjectCheckingTarget>
 * // (input: { target: ObjectCheckingTarget; args: [options?: IssueEditableProps] }) => string
 * ```
 */
export type EmitterMethodOf<
  TSchemaMethod extends (...args: never[]) => unknown,
  TOutput extends EmitterMethodOutput = Check,
  TInput extends CheckingTarget = CheckingTarget,
> = (input: { target: TInput; args: Parameters<TSchemaMethod> }) => TOutput;
