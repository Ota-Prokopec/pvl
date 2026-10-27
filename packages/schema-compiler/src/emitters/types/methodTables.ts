// The tables an Emitter dispatches its methods from (ADR-0033), and what an
// emitter method reads: the Schema it is chained onto, its targets, its
// composite's locals, and the arguments of the method it mirrors, each read
// as written or a Runtime Argument.
import type { RuntimeArgument } from '../../schemas/runtimeArgument/runtimeArgument.js';
import type { Schema } from '../../schemas/schema.js';
import type {
  CheckingTarget,
  CompositeLocalVariableNames,
  EmittedPostModifierStep,
  EmittedPreModifierStep,
} from './schemaParts.js';

/**
 * A method's parameters as an emitter method reads them: each one read as
 * written, or a Runtime Argument its Compiled Schema evaluates.
 *
 * ```ts
 * EmitterArgs<[minLength: number, options?: CheckOptions]>
 * // [minLength: number | RuntimeArgument, options?: CheckOptions | RuntimeArgument]
 * ```
 */
export type EmitterArgs<TParameters extends ReadonlyArray<unknown>> = {
  [Index in keyof TParameters]: TParameters[Index] | RuntimeArgument;
};

/** What an emitter method is handed: the Schema it is chained onto, the targets it reads, its composite's locals, and `TArgs`, the arguments of the method it mirrors. */
export type EmitterMethodInput<TArgs extends ReadonlyArray<unknown>, TSchema extends Schema> = {
  /** The Schema it is chained onto, which a method reading more than its arguments reads, as a literal's `.coerce()` converts as the primitive of its value. */
  schema: TSchema;
  /** What it checks: the Schema's own target, or, for a composite's post-modifier, the same with its output local as the value. */
  target: CheckingTarget;
  /** The Schema's own target, which its parent reads it at: `target`, but for a composite's post-modifier. `.transform()` writes at it, as it runs once the Frame has handed the output on. */
  schemaTarget: CheckingTarget;
  /** Its composite's locals, which a post-modifier reading something besides the value reads, as an object's `.strict()` reads its keys; `undefined` for a pre-modifier, and for a Schema that isn't a composite. */
  compositeLocals: CompositeLocalVariableNames | undefined;
  args: TArgs;
};

/** The step an emitter method writes, by the table holding it: a pre-modifier's, or a post-modifier's. */
export type EmitterMethodStep = EmittedPreModifierStep | EmittedPostModifierStep;

/**
 * The type of an emitter method mirroring `TSchemaMethod`, a method of the
 * `@pvl/schema` schema it compiles. It takes one object (`EmitterMethodInput`)
 * holding that method's own parameters as `args`, so the two can't drift
 * apart, any of them a Runtime Argument (`EmitterArgs`), and `schema`, typed
 * `TSchema`, the Schema subclass it reads, or `never` for one reading none.
 * Returns `TStep`: a post-modifier's step, a pre-modifier's, or `undefined`
 * for a method writing nothing.
 *
 * ```ts
 * EmitterMethodOf<StringInterpretedSchema['min']>
 * // (input: { schema: never; target: CheckingTarget; …; args: [minLength: number | RuntimeArgument, options?: CheckOptions | RuntimeArgument] }) => EmittedPostModifierStep
 * EmitterMethodOf<ChainableInterpretedSchema['optional'], EmittedPreModifierStep> // (input: { …; args: [] }) => EmittedPreModifierStep
 * EmitterMethodOf<LiteralInterpretedSchema<PossibleLiteralValue>['coerce'], EmittedPreModifierStep, LiteralSchema> // (input: { schema: LiteralSchema; …; args: [] }) => EmittedPreModifierStep
 * ```
 */
export type EmitterMethodOf<
  TSchemaMethod extends (...args: never[]) => unknown,
  TStep extends EmitterMethodStep | undefined = EmittedPostModifierStep,
  TSchema extends Schema = never,
> = (input: EmitterMethodInput<EmitterArgs<Parameters<TSchemaMethod>>, TSchema>) => TStep;

/**
 * An Emitter's methods writing one kind of step, by the name of the Schema
 * method each mirrors, which a chained method is dispatched by, each handed
 * `TSchema`, the Schema subclass its Emitter compiles. Each method keeps its
 * own `args` and `schema` (`EmitterMethodOf`), and the table holds it as a
 * method, whose parameter TypeScript compares both ways, as it does
 * `SchemaEmitter._emitBaseCheck`'s: what a call's arguments are is the
 * method's to say, and the compiler trusts the source to pass what it
 * declares (`readCallArguments`), as it trusts a Schema's Emitter to be
 * handed its own Schema subclass. A method writing the other kind of step,
 * or reading another Schema subclass, can't be held in it; one writing
 * `undefined`, nothing, can.
 *
 * ```ts
 * const postModifierSteps = { min, max, length } satisfies EmitterMethodTable<EmittedPostModifierStep>;
 * ({ optional } satisfies EmitterMethodTable<EmittedPostModifierStep>); // a type error: `.optional()` writes a pre-modifier's step
 * ({ strict } satisfies EmitterMethodTable<EmittedPostModifierStep, LiteralSchema>); // a type error: `.strict()` reads an `ObjectSchema`
 * ```
 */
export type EmitterMethodTable<
  TStep extends EmitterMethodStep,
  TSchema extends Schema = Schema,
> = Readonly<
  Record<
    string,
    { emit(input: EmitterMethodInput<ReadonlyArray<unknown>, TSchema>): TStep | undefined }['emit']
  >
>;

/** An Emitter's pre-modifiers, each writing its step: `{ optional, nullable, coerce }`. */
export type PreModifierStepTable<TSchema extends Schema = Schema> = EmitterMethodTable<
  EmittedPreModifierStep,
  TSchema
>;

/** An Emitter's post-modifiers, each writing its step: `{ min, max, length, refine, transform }`. */
export type PostModifierStepTable<TSchema extends Schema = Schema> = EmitterMethodTable<
  EmittedPostModifierStep,
  TSchema
>;

/**
 * For each method of `TSchema` an emitter compiles, the TypeScript type of
 * each of its parameters, as a Compiled Schema's constructor declares a
 * Runtime Argument passed there. Typed by the method itself, so a method
 * that gains or loses a parameter fails the compiler's type check.
 *
 * ```ts
 * ParameterTypesOf<StringInterpretedSchema>
 * // { min?: readonly [string, string]; max?: …; length?: …; … }
 * const parameterTypes: ParameterTypesOf<StringInterpretedSchema> = { min: ['number', CHECK_OPTIONS_TYPE_STRING] };
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
