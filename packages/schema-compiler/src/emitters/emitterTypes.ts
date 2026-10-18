// The target an emitter method mirroring a Schema method reads, and the type
// that ties its arguments to that Schema method's own and its output to the
// kind of source text it writes.

import type {
  EmittedCheck,
  EmittedOutputStatement,
  EmittedShortCircuitCondition,
} from '../types.js';

/** A Modifier method input: what an emitter method reads, the value it checks and the Issue path it reports at, each as an expression. */
export type CheckingTarget = {
  /** The checked value, as an expression: `value`, `field0`, `element`. */
  value: string;
  /** The full `path` of an Issue reported for it, as an expression: `[...path, "name"]`, not just the key. */
  issuePath: string;
};

/**
 * The type of an emitter method mirroring `TSchemaMethod`, a method of the
 * `@pvl/schema` schema it compiles. It takes one object: the target, and
 * that method's own parameters as `args`, so the two can't drift apart.
 * Returns source text: a check, or `TOutput` for a method that writes a
 * pre-modifier's short-circuit condition or a statement building the output
 * instead; a composite's method reads a wider `TInput`.
 *
 * ```ts
 * EmitterMethodOf<StringSchema['min']>
 * // (input: { target: CheckingTarget; args: [minLength: number, options?: IssueEditableProps] }) => EmittedCheck
 * EmitterMethodOf<ChainableSchema['optional'], EmittedShortCircuitCondition> // (input: { target: CheckingTarget; args: [] }) => EmittedShortCircuitCondition
 * EmitterMethodOf<ObjectSchema['passthrough'], EmittedOutputStatement, ObjectCheckingTarget>
 * // (input: { target: ObjectCheckingTarget; args: [] }) => EmittedOutputStatement
 * ```
 */
export type EmitterMethodOf<
  TSchemaMethod extends (...args: never[]) => unknown,
  TOutput extends EmittedCheck | EmittedShortCircuitCondition | EmittedOutputStatement =
    EmittedCheck,
  TInput extends CheckingTarget = CheckingTarget,
> = (input: { target: TInput; args: Parameters<TSchemaMethod> }) => TOutput;
