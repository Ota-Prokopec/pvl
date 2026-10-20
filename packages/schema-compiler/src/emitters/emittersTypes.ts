// The kinds of emitted source text, each branded so one can't be passed
// where another is expected: a string becomes one only where it is written.
// Also what an emitter method reads: its target, and the arguments of the
// method it mirrors, each read as written or a Runtime Argument.
import type { RuntimeArgument } from '../schemas/runtimeArgument.js';

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
 * A method's parameters as an emitter method reads them: each one read as
 * written, or a Runtime Argument its Compiled Schema evaluates.
 *
 * ```ts
 * EmitterArgs<[minLength: number, options?: IssueEditableProps]>
 * // [minLength: number | RuntimeArgument, options?: IssueEditableProps | RuntimeArgument]
 * ```
 */
export type EmitterArgs<TParameters extends ReadonlyArray<unknown>> = {
  [Index in keyof TParameters]: TParameters[Index] | RuntimeArgument;
};

/**
 * The type of an emitter method mirroring `TSchemaMethod`, a method of the
 * `@pvl/schema` schema it compiles. It takes one object: the target, and
 * that method's own parameters as `args`, so the two can't drift apart,
 * any of them a Runtime Argument (`EmitterArgs`). Returns source text: a
 * check, or `TOutput` for a method that writes a pre-modifier's
 * short-circuit condition or a statement building the output instead; a
 * composite's method reads a wider `TInput`.
 *
 * ```ts
 * EmitterMethodOf<StringInterpretedSchema['min']>
 * // (input: { target: CheckingTarget; args: [minLength: number | RuntimeArgument, options?: IssueEditableProps | RuntimeArgument] }) => EmittedCheck
 * EmitterMethodOf<ChainableInterpretedSchema['optional'], EmittedShortCircuitCondition> // (input: { target: CheckingTarget; args: [] }) => EmittedShortCircuitCondition
 * EmitterMethodOf<ObjectInterpretedSchema['passthrough'], EmittedOutputStatement, ObjectCheckingTarget>
 * // (input: { target: ObjectCheckingTarget; args: [] }) => EmittedOutputStatement
 * ```
 */
export type EmitterMethodOf<
  TSchemaMethod extends (...args: never[]) => unknown,
  TOutput extends EmittedCheck | EmittedShortCircuitCondition | EmittedOutputStatement =
    EmittedCheck,
  TInput extends CheckingTarget = CheckingTarget,
> = (input: { target: TInput; args: EmitterArgs<Parameters<TSchemaMethod>> }) => TOutput;

/**
 * For each method of `TSchema` an emitter compiles, the TypeScript type of
 * each of its parameters, as a Compiled Schema's constructor declares a
 * Runtime Argument passed there. Typed by the method itself, so a method
 * that gains or loses a parameter fails the compiler's type check.
 *
 * ```ts
 * ParameterTypesOf<StringInterpretedSchema>
 * // { min?: readonly [string, string]; max?: …; length?: …; … }
 * const parameterTypes: ParameterTypesOf<StringInterpretedSchema> = { min: ['number', ISSUE_OPTIONS_TYPE] };
 * ```
 */
export type ParameterTypesOf<TSchema> = {
  readonly [Name in keyof TSchema]?: TSchema[Name] extends (...args: infer TParameters) => unknown
    ? { readonly [Index in keyof TParameters]-?: string }
    : never;
};

/**
 * For each method of `TSchema` whose default message names its first
 * argument, that message, one of `<SCHEMA>_SCHEMA_ISSUE_MESSAGE`'s
 * functions. A Compiled Schema's constructor builds it once for a Runtime
 * Argument passed there. Typed by the method itself, so the message takes
 * what the method's first parameter does.
 *
 * ```ts
 * ArgumentMessagesOf<StringInterpretedSchema>
 * // { min?: (value: number) => string; max?: …; length?: …; … }
 * const argumentMessages = { min: STRING_SCHEMA_ISSUE_MESSAGE.min } satisfies ArgumentMessagesOf<StringInterpretedSchema>;
 * ```
 */
export type ArgumentMessagesOf<TSchema> = {
  readonly [Name in keyof TSchema]?: TSchema[Name] extends (
    value: infer TValue,
    ...rest: never[]
  ) => unknown
    ? (value: TValue) => string
    : never;
};
