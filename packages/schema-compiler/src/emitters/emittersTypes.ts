// The kinds of emitted source text, each branded so one can't be passed
// where another is expected: a string becomes one only where it is written.

/** A local's declaration, which a composite's frame places before its children: `const path1 = [...path, "tags"];`. `''` sets the code after it apart with a blank line. */
export type EmittedVariableDeclaration = string & { readonly __brand: 'variableDeclaration' };

/** An Issue as an object literal, which a failed check pushes onto `issues`. */
export type EmittedIssue = string & { readonly __brand: 'issue' };

/** A check as a statement, which pushes its Issue onto `issues` when it fails: `if (field0.length < 3) { … }`. */
export type EmittedCheck = string & { readonly __brand: 'check' };

/** A pre-modifier's condition, as an expression: a value it holds for skips every other check, as `.optional()`'s `field0 === undefined`. */
export type EmittedShortCircuitCondition = string & { readonly __brand: 'shortCircuitCondition' };

/** A statement building a composite's output or handing it on: `output1["name"] = field1;`, `field0 = output1;`. */
export type EmittedOutputStatement = string & { readonly __brand: 'outputStatement' };

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
