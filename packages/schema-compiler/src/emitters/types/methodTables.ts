// The tables an Emitter dispatches its methods from (ADR-0033), and what an
// emitter method reads: its target, and the arguments of the method it
// mirrors, each read as written or a Runtime Argument.
import type { RuntimeArgument } from '../../schemas/runtimeArgument.js';
import type {
  EmittedCheck,
  EmittedMethodText,
  EmittedShortCircuitCondition,
} from './emittedText.js';
import type { CheckingTarget } from './schemaParts.js';

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
 * short-circuit condition instead.
 *
 * ```ts
 * EmitterMethodOf<StringInterpretedSchema['min']>
 * // (input: { target: CheckingTarget; args: [minLength: number | RuntimeArgument, options?: IssueEditableProps | RuntimeArgument] }) => EmittedCheck
 * EmitterMethodOf<ChainableInterpretedSchema['optional'], EmittedShortCircuitCondition> // (input: { target: CheckingTarget; args: [] }) => EmittedShortCircuitCondition
 * ```
 */
export type EmitterMethodOf<
  TSchemaMethod extends (...args: never[]) => unknown,
  TOutput extends EmittedMethodText = EmittedCheck,
> = (input: { target: CheckingTarget; args: EmitterArgs<Parameters<TSchemaMethod>> }) => TOutput;

/**
 * An Emitter's methods writing one kind of text, by the name of the Schema
 * method each mirrors, which a chained method is dispatched by. Each method
 * keeps its own `args` (`EmitterMethodOf`), so the table reads them as
 * `never`: what a call's arguments are is the method's to say, and the
 * compiler trusts the source to pass what it declares
 * (`readCallArguments`). A method writing another kind of text can't be
 * held in it.
 *
 * ```ts
 * const postModifierChecks = { min, max, length } satisfies EmitterMethodTable<EmittedCheck>;
 * ({ optional } satisfies EmitterMethodTable<EmittedCheck>); // a type error: `.optional()` writes a short-circuit condition
 * ```
 */
export type EmitterMethodTable<TOutput extends EmittedMethodText> = Readonly<
  Record<string, (input: { target: CheckingTarget; args: never }) => TOutput>
>;

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
