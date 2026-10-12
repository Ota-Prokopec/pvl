// The shapes an emitter method mirroring a Schema method reads and hands
// back, and the type that ties its arguments to that Schema method's own.

/** A Modifier method input: what an emitter method reads, the value it checks and the Issue path it reports at, each as an expression. */
export type EmittingCheckMethodInput = {
  /** The checked value, as an expression: `value`, `field0`, `element`. */
  value: string;
  /** The full `path` of an Issue reported for it, as an expression: `[...path, "name"]`, not just the key. */
  issuePath: string;
};

/** A Modifier method output: one check, the condition it fails under, and the Issue literal it reports then. */
export type EmittingCheckMethodOutputWithCheck = {
  failsWhen: string;
  issue: string;
};

/** A Modifier method output that is no check but source text: `.optional()`'s condition, `.strict()`'s loop. */
export type EmittingCheckMethodOutputWithoutCheck = string;

export type EmittingCheckMethodOutput =
  EmittingCheckMethodOutputWithCheck | EmittingCheckMethodOutputWithoutCheck;

/**
 * The type of an emitter method mirroring `TSchemaMethod`, a method of the
 * `@pvl/schema` schema it compiles. It takes one object: the target, and
 * that method's own parameters as `args`, so the two can't drift apart.
 * Returns a check, or `TOutput` for a method that writes source text
 * instead; a composite's method reads a wider `TInput`.
 *
 * ```ts
 * EmitterMethodOf<StringSchema['min']>
 * // (input: { target: EmittingCheckMethodInput; args: [minLength: number, options?: IssueEditableProps] }) => EmittingCheckMethodOutput
 * EmitterMethodOf<ChainableSchema['optional'], string> // (input: { target: EmittingCheckMethodInput; args: [] }) => string
 * EmitterMethodOf<ObjectSchema['strict'], string, ObjectEmittingCheckMethodInput>
 * // (input: { target: ObjectEmittingCheckMethodInput; args: [options?: IssueEditableProps] }) => string
 * ```
 */
export type EmitterMethodOf<
  TSchemaMethod extends (...args: never[]) => unknown,
  TOutput extends EmittingCheckMethodOutput = EmittingCheckMethodOutput,
  TInput extends EmittingCheckMethodInput = EmittingCheckMethodInput,
> = (input: { target: TInput; args: Parameters<TSchemaMethod> }) => TOutput;
