// The kinds of emitted source text, each branded so one can't be passed
// where another is expected: a string becomes one only where it is written,
// by one function each (`emitCheck` and its siblings). Also the parts an
// Emitter emits for one Schema, which its Frame composes, the names of a
// composite's locals among them, what an emitter method reads (its target,
// and the arguments of the method it mirrors, each read as written or a
// Runtime Argument), and the tables an Emitter dispatches its methods from.
// `.coerce()`'s conversion and `.transform()`'s call are written by hooks of
// their own, not dispatched from a table (ADR-0035).
import type { RuntimeArgument } from '../schemas/runtimeArgument.js';

/** A local a composite declares, which its frame places after its own and before its children: `const output2: unknown[] = [];`. */
export type EmittedVariableDeclaration = string & { readonly __brand: 'variableDeclaration' };

/** An Issue as an object literal, which a failed check pushes onto `issues`. */
export type EmittedIssue = string & { readonly __brand: 'issue' };

/** A check as a statement, which pushes its Issue onto `issues` when it fails: `if (field0.length < 3) { … }`. */
export type EmittedCheck = string & { readonly __brand: 'check' };

/** A pre-modifier's condition, as an expression: a value it holds for skips every other check, as `.optional()`'s `field0 === undefined`. */
export type EmittedShortCircuitCondition = string & { readonly __brand: 'shortCircuitCondition' };

/** `.coerce()`'s conversion, as statements replacing the value before its type check: `field0 = String(field0);`. */
export type EmittedCoercion = string & { readonly __brand: 'coercion' };

/** `.transform()`'s call, as a statement replacing the value with what the user's function returns: `field0 = this.arg0.call(undefined, field0 as never);`. */
export type EmittedTransform = string & { readonly __brand: 'transform' };

/**
 * One pre-modifier's part, in chain order: the condition a value
 * short-circuits under (`.optional()`, `.nullable()`), or the conversion
 * replacing it (`.coerce()`).
 */
export type PreModifierStep =
  { shortCircuitCondition: EmittedShortCircuitCondition } | { coercion: EmittedCoercion };

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
 * // { locals: <locals ending in 2>, declarations: ['const output2: unknown[] = [];'], childChecks: ['for (let index2 = 0; …) { … }'], setsChildrenApart: false, outputStatements: [] }
 * ```
 */
export type CompositeParts = {
  /** The names of its locals, numbered before any Schema nested in it. Its Frame declares its path and Issue-count locals, and hands its output on. */
  locals: CompositeLocals;
  /** The locals it declares itself, after its Frame's own. */
  declarations: EmittedVariableDeclaration[];
  /** Its children's checks, each composed by the child's own Frame. */
  childChecks: string[];
  /** Whether its Frame sets its children's checks apart with a blank line before, between and after them, as an object's fields are; an array's one loop isn't. */
  setsChildrenApart: boolean;
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
 * // { baseCheck: 'if (typeof field0 !== "string") { … }', preModifierSteps: [{ shortCircuitCondition: 'field0 === undefined' }], postModifierChecks: ['if (field0.length < 3) { … }'] }
 * ```
 */
export type SchemaParts = {
  /** Its type check, whose `else` everything but its pre-modifiers' parts and its transform runs in. */
  baseCheck: EmittedCheck;
  /** Its pre-modifiers' parts, in chain order: a condition skips every check after it, and a conversion replaces the value. */
  preModifierSteps: PreModifierStep[];
  /** Its post-modifiers' checks, which run once its base check has passed, and every child has. */
  postModifierChecks: EmittedCheck[];
  /** What a composite adds; `undefined` for any other Schema. */
  composite?: CompositeParts;
  /** Its `.transform()`, which runs once every other check has, unless one of them reported an Issue, and after a short-circuit too; `undefined` when it has none. */
  transform?: TransformParts;
};

/**
 * A Schema's `.transform()`, which replaces its value once its checks have
 * run, and the local holding the count of Issues taken before them, which
 * it is gated behind. A chain holds at most one, always last.
 *
 * ```ts
 * <the transform of pvl.string().transform(trim) at field0>
 * // { issueCount: 'field0IssueCount', statement: 'field0 = this.arg0.call(undefined, field0 as never);' }
 * ```
 */
export type TransformParts = {
  /** The count of Issues taken before its checks: `field0IssueCount`. */
  issueCount: string;
  statement: EmittedTransform;
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

/** The kinds of source text an emitter method writes: a check, a pre-modifier's short-circuit condition, or a statement building a composite's output. */
export type EmittedMethodText =
  EmittedCheck | EmittedShortCircuitCondition | EmittedOutputStatement;

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
  TOutput extends EmittedMethodText = EmittedCheck,
  TInput extends CheckingTarget = CheckingTarget,
> = (input: { target: TInput; args: EmitterArgs<Parameters<TSchemaMethod>> }) => TOutput;

/**
 * An Emitter's methods writing one kind of text at one kind of target, by
 * the name of the Schema method each mirrors, which a chained method is
 * dispatched by. Each method keeps its own `args` (`EmitterMethodOf`), so
 * the table reads them as `never`: what a call's arguments are is the
 * method's to say, and the compiler trusts the source to pass what it
 * declares (`readCallArguments`). A method writing another kind of text,
 * or reading a wider target, can't be held in it.
 *
 * ```ts
 * const postModifierChecks = { min, max, length } satisfies EmitterMethodTable<EmittedCheck>;
 * ({ strict } satisfies EmitterMethodTable<EmittedCheck>); // a type error: `.strict()` reads an `ObjectCheckingTarget`
 * ```
 */
export type EmitterMethodTable<
  TOutput extends EmittedMethodText,
  TInput extends CheckingTarget = CheckingTarget,
> = Readonly<Record<string, (input: { target: TInput; args: never }) => TOutput>>;

/** An Emitter's pre-modifiers, each writing the condition a value short-circuits under: `{ optional, nullable }`. */
export type ShortCircuitConditionTable = EmitterMethodTable<EmittedShortCircuitCondition>;

/** An Emitter's post-modifiers that check its value, each writing its check: `{ min, max, length }`. */
export type PostModifierCheckTable = EmitterMethodTable<EmittedCheck>;

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
