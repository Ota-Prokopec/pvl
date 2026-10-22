// The kinds of emitted source text, each branded so one can't be passed
// where another is expected: a string becomes one only where it is written.
// Also the parts an Emitter emits for one Schema, which its Frame composes,
// the names of a composite's locals among them,
// and what an emitter method reads: its target, and the arguments of the
// method it mirrors, each read as written or a Runtime Argument.
import type { RuntimeArgument } from '../schemas/runtimeArgument.js';

/** A local a composite declares, which its frame places after its own and before its children: `const output2: unknown[] = [];`. `''` sets the code after it apart with a blank line. */
export type EmittedVariableDeclaration = string & { readonly __brand: 'variableDeclaration' };

/** An Issue as an object literal, which a failed check pushes onto `issues`. */
export type EmittedIssue = string & { readonly __brand: 'issue' };

/** A check as a statement, which pushes its Issue onto `issues` when it fails: `if (field0.length < 3) { … }`. */
export type EmittedCheck = string & { readonly __brand: 'check' };

/** A pre-modifier's condition, as an expression: a value it holds for skips every other check, as `.optional()`'s `field0 === undefined`. */
export type EmittedShortCircuitCondition = string & { readonly __brand: 'shortCircuitCondition' };

/** A statement building a composite's output: `output1["name"] = field1;`, `.passthrough()`'s loop. */
export type EmittedOutputStatement = string & { readonly __brand: 'outputStatement' };

/** The names of the locals a composite's checks declare, all ending in the same number, so they never clash with its parent's or its children's. */
export type CompositeLocals = {
  /** Its value, read as a record: `input1`. */
  input: string;
  /** The output its checks build, which replaces its value: `output1`. */
  output: string;
  /** The index of the element being checked: `index1`. */
  index: string;
  /** The element being checked: `element1`. */
  element: string;
  /** Its path, which its children's paths extend: `path1`. */
  path: string;
  /** The count of Issues taken before its children, which its post-modifiers are gated behind: `issueCount1`. */
  issueCount: string;
};

/**
 * What a composite checks and builds once its base check has passed,
 * besides its post-modifiers' checks: the locals it declares, its
 * children's checks, which run before its post-modifiers', and the
 * statements building its output, which its Frame then hands on.
 *
 * ```ts
 * <the composite parts of pvl.array(pvl.string()) at field0>
 * // { locals: <locals ending in 2>, declarations: ['const output2: unknown[] = [];'], childChecks: ['for (let index2 = 0; …) { … }'], outputStatements: [] }
 * ```
 */
export type CompositeParts = {
  /** The names of its locals, numbered before any Schema nested in it. Its Frame declares its path and Issue-count locals, and hands its output on. */
  locals: CompositeLocals;
  /** The locals it declares itself, after its Frame's own. */
  declarations: EmittedVariableDeclaration[];
  /** Its children's checks, each composed by the child's own Frame. */
  childChecks: string[];
  /** The statements building its output. */
  outputStatements: EmittedOutputStatement[];
};

/**
 * Every part of one Schema's checks, as its Emitter emits them for its
 * Frame to compose. A Schema is a composite exactly when it has `composite`
 * parts: its checks then build an output that replaces its value.
 *
 * ```ts
 * <the parts of pvl.string().optional().min(3) at field0>
 * // { baseCheck: 'if (typeof field0 !== "string") { … }', shortCircuitConditions: ['field0 === undefined'], postModifierChecks: ['if (field0.length < 3) { … }'] }
 * ```
 */
export type SchemaParts = {
  /** Its type check, whose `else` everything but its short-circuit conditions runs in. */
  baseCheck: EmittedCheck;
  /** Its pre-modifiers' conditions, any one of which skips every check. */
  shortCircuitConditions: EmittedShortCircuitCondition[];
  /** Its post-modifiers' checks, which run once its base check has passed, and every child has. */
  postModifierChecks: EmittedCheck[];
  /** What a composite adds; `undefined` for any other Schema. */
  composite?: CompositeParts;
};

/** A Modifier method input: what an emitter method reads, the value it checks and its paths, each as an expression. */
export type CheckingTarget = {
  /** The checked value, as an expression: `value`, `field0`, `element1`. */
  value: string;
  /** The value's path, as an array expression, which its fields' and elements' paths extend: `path` at the root, `[...path1, "name"]` nested. */
  path: string;
  /** The full `path` of an Issue reported for the value itself, as an expression: `[...path1, "name"]`, not just the key. It holds the same array as `path`, except at the root, where it is `undefined` when `path` is empty, as `@pvl/schema`'s own `Issue` makes it. */
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
