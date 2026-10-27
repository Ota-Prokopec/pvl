// The abstract base class every emitter extends, as every schema of
// `@pvl/schema` extends `Schema`. It does the emitting, following the
// pipeline of ADR-0010: it emits a Schema's parts as source text (its
// composite parts, its base check, its pre-modifiers' parts, its
// post-modifiers' checks, its transform), and `_emitSchemaParts` returns
// them as one `SchemaParts`. A composite's emitter supplies what makes it
// one through `_emitSchemaCompositeParts` (locals, declarations, children's
// checks, output statements), and its post-modifiers are handed its output
// local to read. The Frame composes those parts, the same way where a parent
// reads the value and at the root, at `_validate`'s own parameters, where it
// wraps the checks in the Compiled Schema's class (`emitCompiledSchema`). It
// also dispatches each chained method to the emitter method of its name,
// through the table of the kind of step that method writes (ADR-0033): a
// pre-modifier's, or a post-modifier's.
// Every method whose name starts with `emit` or `_emit` returns source text,
// a string or a list of them (ADR-0028), or, for `_emitSchemaParts`, the
// parts holding it (ADR-0032). A subclass adds the methods mirroring its
// schema's to its tables and overrides the `_` hooks. What reads nothing of
// the emitter it is called on is a function in `./utils/`.
import type { Schema } from '../schemas/schema.js';
import type { SchemaTypes, SpelledType } from '../spelledType/types.js';
import { UNDEFINEDNESS } from '../enums.js';
import { Frame } from '../frame/frame.js';
import { Scope } from '../scope.js';
import type { SchemaEmitter } from './schemaEmitter.js';
import type { CompiledSchema, EmitCompiledSchemaArgs } from './types/compiledSchema.js';
import type {
  CompilesMethodArgs,
  EmitElementPropertyArgs,
  EmitSchemaCompositePartsArgs,
  EmitShapePropertyArgs,
  SpellParameterTypesArgs,
  SpellTypesArgs,
} from './types/hookArgs.js';
import type {
  EmitterMethodInput,
  PostModifierStepTable,
  PreModifierStepTable,
} from './types/methodTables.js';
import type {
  CheckingTarget,
  EmittedPreModifierStep,
  SchemaCompositeParts,
  SchemaParts,
} from './types/schemaParts.js';
import type { EmittedStandaloneProperty } from './types/standaloneProperties.js';
import { RuntimeArgument } from '../runtimeArgument/runtimeArgument.js';
import { js } from './utils/js.js';
import { emitMethodCall } from './utils/methodCall.js';

/** For each method an emitter compiles, the TypeScript type of each of its parameters (see `ParameterTypesOf`). */
type EmitterParameterTypes = Readonly<Partial<Record<string, ReadonlyArray<string>>>>;

/** For each method whose default message names its first argument, that message (see `ArgumentMessagesOf`). */
type EmitterArgumentMessages = Readonly<Partial<Record<string, (value: never) => string>>>;

/** What {@link Emitter.emitPreModifierSteps} emits its pre-modifiers' parts for: a Schema at the target it checks. */
type EmitPreModifierStepsArgs = {
  schema: Schema;
  target: CheckingTarget;
};

/** What {@link Emitter.emitPostModifierSteps} emits its post-modifiers' parts for: a Schema at the targets they read, and its composite's locals. */
type EmitPostModifierStepsArgs = Omit<EmitterMethodInput<never, Schema>, 'args'>;

/** What {@link Emitter._emitSchemaParts} emits every part of a Schema's checks for: a Schema at the target it checks, inlined into a parent, or at `Frame.rootCheckingTarget`, as the body of a Compiled Schema's `_validate`. */
type EmitSchemaPartsArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
  /** Numbers the locals of the Compiled Schema's class the checks are emitted into. */
  scope: Scope;
};

/** What {@link Emitter.emitNestedSchemaChecks} emits a field's or an element's checks for: its Schema, the local its value is read into, and its path. */
type EmitNestedSchemaChecksArgs = {
  schema: Schema;
  /** The local its value is read into: `field0`, `element1`. */
  value: string;
  /** The type the local is declared with, or `undefined` to leave it inferred: `unknown` for an element. */
  valueType: string | undefined;
  /** The expression its value is read from: `input1["name"]`, `value[index1]`. */
  read: string;
  /** Its path, as an array expression: `[...path1, "name"]`, `[...path1, index1]`. */
  path: string;
  /** Numbers the locals of the Compiled Schema's class the checks are emitted into. */
  scope: Scope;
};

/** What {@link Emitter.emitStandaloneCompiledSchema} writes the Compiled Schema of a Standalone Key or a marked element for. */
type EmitStandaloneCompiledSchemaArgs = Omit<
  EmitCompiledSchemaArgs,
  'indentation' | 'hoistedNameByExpression'
>;

/**
 * The abstract base of every emitter. Its static methods are called on the emitter
 * of the Schema being emitted, so `this` is that emitter:
 * `StringSchemaEmitter._emitSchemaParts({ schema, target, scope })` emits
 * `.min(3)` with `StringSchemaEmitter.postModifierSteps.min`.
 *
 * The methods mirroring a Schema's are held in tables, one per kind of step
 * they write, as a Schema splits its calls (`preModifierCalls`,
 * `postModifierCalls`), each spread from the table of the Emitter it
 * extends: a chained method compiles exactly when a table holds a method of
 * its name (`compilesMethod`). Every method takes one object, so a hook
 * reads only what it needs.
 */
export abstract class Emitter {
  /**
   * The pre-modifiers this emitter compiles, each writing its step, by the
   * name of the method it mirrors: the condition a value short-circuits
   * under, or the conversion replacing it. `ChainableSchemaEmitter` adds
   * `.optional()` and `.nullable()`, and a primitive's emitter and a
   * literal's their `.coerce()`.
   */
  public static readonly preModifierSteps: PreModifierStepTable = {};

  /**
   * The post-modifiers this emitter compiles, each writing its step, by the
   * name of the method it mirrors: its check, or `.transform()`'s call
   * replacing the value. `ChainableSchemaEmitter` adds `.refine()` and
   * `.transform()`, and each schema's emitter its Constraints; an object's
   * `.strict()` reads its Schema's keys and its composite's locals, and its
   * `.passthrough()` writes nothing.
   */
  public static readonly postModifierSteps: PostModifierStepTable = {};

  /**
   * For each method this emitter compiles, the TypeScript type of each of
   * its parameters, which a Compiled Schema's constructor declares a
   * Runtime Argument passed there with. A subclass whose methods take
   * arguments overrides it.
   */
  public static readonly parameterTypes: EmitterParameterTypes = {};

  /**
   * For each method this emitter compiles whose default message names its
   * first argument, that message, which a Compiled Schema's constructor
   * builds once for a Runtime Argument passed there. The method's own check
   * reads its message from here too (`emitDefaultMessage`), so the two can't
   * disagree. A subclass whose Constraints' messages name their bound
   * overrides it.
   */
  public static readonly argumentMessages: EmitterArgumentMessages = {};

  /**
   * Every part of `schema`'s checks at `target`, for its Frame to compose:
   * its composite parts, if it is one, its base check, its pre-modifiers'
   * parts, its post-modifiers' checks and its transform. The composite
   * parts are emitted first, so a composite numbers its locals from `scope`
   * before any Schema nested in it. A composite's post-modifiers read the
   * output it builds, as the interpreted ones read `_checkType`'s
   * (ADR-0035), and its transform reads the value the Frame hands that
   * output on to.
   *
   * ```ts
   * StringSchemaEmitter._emitSchemaParts({ schema: <pvl.string().optional().min(3)>, target: { value: 'field0', path, issuePath }, scope })
   * // { baseCheck: 'if (typeof field0 !== "string") { … }', preModifierSteps: [{ shortCircuitCondition: 'field0 === undefined' }], postModifierChecks: ['if (field0.length < 3) { … }'] }
   * ArraySchemaEmitter._emitSchemaParts({ schema: <pvl.array(pvl.string()).min(1)>, target: <field0 at [...path1, "tags"]>, scope })
   * // { …, postModifierChecks: ['if (output2.length < 1) { … }'], composite: { locals: <locals ending in 2>, … } }
   * ```
   */
  public static _emitSchemaParts(this: SchemaEmitter, args: EmitSchemaPartsArgs): SchemaParts {
    const { schema, target } = args;
    const composite = this._emitSchemaCompositeParts?.(args);

    return {
      baseCheck: this._emitBaseCheck({ schema, target }),
      preModifierSteps: this.emitPreModifierSteps({ schema, target }),
      ...this.emitPostModifierSteps({
        schema,
        target: composite === undefined ? target : { ...target, value: composite.locals.output },
        schemaTarget: target,
        compositeLocals: composite?.locals,
      }),
      composite,
    };
  }

  /**
   * What makes `schema` a composite at `target`: its locals, its
   * declarations, its children's checks and the statements building its
   * output, which only a composite's emitter has, so a Schema without it
   * isn't one. It numbers its locals from `scope` first, then emits its
   * children's parts with the same `scope`.
   *
   * ```ts
   * StringSchemaEmitter._emitSchemaCompositeParts // undefined
   * ArraySchemaEmitter._emitSchemaCompositeParts({ schema: <pvl.array(pvl.string())>, target: <field0 at [...path1, "tags"]>, scope })
   * // { locals: <locals ending in 2>, declarations: ['const output2: unknown[] = [];'], childChecks: ['for (let index2 = 0; …) { … }'], setsChildrenApart: false, outputStatements: [] }
   * ```
   */
  protected static _emitSchemaCompositeParts?(
    args: EmitSchemaCompositePartsArgs,
  ): SchemaCompositeParts;

  /**
   * What a compiled object exposes besides validating, its `shape`: the
   * Compiled Schema of each Standalone Key, `{}` with none, with its type,
   * the class field declaring it and the constructor statement building it
   * (ADR-0036). Only the object Emitter has it, and
   * `emitCompiledSchema` skips it for a transformed Schema, whose value
   * needn't have one.
   *
   * ```ts
   * StringSchemaEmitter._emitShapeProperty // undefined: nothing to expose
   * ObjectSchemaEmitter._emitShapeProperty({ schema: <pvl.object({ age: pvl.number() })>, … })
   * // { type: '{ readonly shape: {} }', declaration: 'readonly shape: {} = {};', statement: undefined }
   * ObjectSchemaEmitter._emitShapeProperty({ schema: <pvl.object({ name: pvl.string().standalone() })>, className: 'PvlCompiledSchema0' })
   * // { type: '{ readonly shape: { readonly name: PvlSchema<string, string> & PvlStandaloneMarker } }', declaration: 'readonly shape: { … };', statement: 'this.shape = {\n  "name": (new (class PvlCompiledSchema0_0 …)() as …),\n};' }
   * ```
   */
  protected static _emitShapeProperty?(args: EmitShapePropertyArgs): EmittedStandaloneProperty;

  /**
   * What a compiled array exposes besides validating, its `element`: the
   * element's own Compiled Schema, when it is marked `.standalone()`, and
   * nothing otherwise, as an unmarked element is exposed nowhere
   * (ADR-0039). Only the array Emitter has it, and `emitCompiledSchema`
   * skips it for a transformed Schema, whose value needn't have one.
   *
   * ```ts
   * StringSchemaEmitter._emitElementProperty // undefined: nothing to expose
   * ArraySchemaEmitter._emitElementProperty({ schema: <pvl.array(pvl.string())>, className: 'PvlCompiledSchema0' })
   * // undefined
   * ArraySchemaEmitter._emitElementProperty({ schema: <pvl.array(pvl.string().standalone())>, className: 'PvlCompiledSchema0' })
   * // { type: '{ readonly element: PvlSchema<string, string> & PvlStandaloneMarker }', declaration: 'readonly element: …;', statement: 'this.element = (new (class PvlCompiledSchema0_element …)() as …);' }
   * ```
   */
  protected static _emitElementProperty?(
    args: EmitElementPropertyArgs,
  ): EmittedStandaloneProperty | undefined;

  /**
   * The parts of `schema.preModifierCalls` at `target`, in chain order, each
   * written by the method of its name in `preModifierSteps`: a
   * short-circuit condition, which a value a pre-modifier accepts holds
   * for, skipping every check after it, or `.coerce()`'s conversion, which
   * replaces the value. A method writing nothing is left out.
   *
   * ```ts
   * StringSchemaEmitter.emitPreModifierSteps({ schema: <pvl.string().nullable().coerce().optional()>, target: { value: 'field0', path, issuePath } })
   * // [{ shortCircuitCondition: 'field0 === null' }, { coercion: 'field0 = String(field0);' }, { shortCircuitCondition: 'field0 === undefined' }]
   * ObjectSchemaEmitter.emitPreModifierSteps({ schema: <pvl.object({})>, target }) // []
   * ```
   */
  public static emitPreModifierSteps({
    schema,
    target,
  }: EmitPreModifierStepsArgs): EmittedPreModifierStep[] {
    return schema.preModifierCalls.flatMap((call) => {
      const step = emitMethodCall({
        table: this.preModifierSteps,
        call,
        schema,
        target,
        schemaTarget: target,
        // A pre-modifier runs before a composite declares its locals.
        compositeLocals: undefined,
        emitterName: this.name,
      });
      return step === undefined ? [] : [step];
    });
  }

  /**
   * The parts of `schema.postModifierCalls`, in chain order, each written by
   * the method of its name in `postModifierSteps`: their checks, as
   * statements at `target`, each reporting at its `issuePath` as the base
   * check does, and `.transform()`'s call at `schemaTarget`, set apart, as
   * its Frame runs it after the checks and only if none failed, as
   * `@pvl/schema` tags it. A method writing nothing, as `.passthrough()`,
   * is left out.
   *
   * ```ts
   * StringSchemaEmitter.emitPostModifierSteps({ schema: <pvl.string().min(3).max(20)>, target: { value: 'field0', path, issuePath }, schemaTarget: <the same>, compositeLocals: undefined })
   * // { postModifierChecks: ['if (field0.length < 3) {\n  issues.push({ code: "TOO_SMALL", … });\n}', 'if (field0.length > 20) { … }'], transform: undefined }
   * StringSchemaEmitter.emitPostModifierSteps({ schema: <pvl.string().transform(trim)>, … })
   * // { postModifierChecks: [], transform: 'field0 = this.arg0.call(undefined, field0 as never);' }
   * ```
   */
  public static emitPostModifierSteps({
    schema,
    ...input
  }: EmitPostModifierStepsArgs): Pick<SchemaParts, 'postModifierChecks' | 'transform'> {
    const steps = schema.postModifierCalls.flatMap((call) => {
      const step = emitMethodCall({
        table: this.postModifierSteps,
        call,
        schema,
        ...input,
        emitterName: this.name,
      });
      return step === undefined ? [] : [step];
    });
    return {
      postModifierChecks: steps.flatMap((step) => ('check' in step ? [step.check] : [])),
      // A chain holds at most one `.transform()`, always last (ADR-0016).
      transform: steps.flatMap((step) => ('transform' in step ? [step.transform] : [])).at(0),
    };
  }

  /**
   * The TypeScript type of each parameter of `call`, a method chained onto
   * `schema`, which a Compiled Schema's constructor declares a Runtime
   * Argument passed there with: its emitter's `parameterTypes`. An emitter
   * whose method takes a parameter typed by the Schema itself, as
   * `.refine()`'s predicate takes the value, overrides it.
   *
   * ```ts
   * StringSchemaEmitter._spellParameterTypes({ schema, call: <.max(max)> })          // ['number', '{ message?: string } | undefined']
   * StringSchemaEmitter._spellParameterTypes({ schema, call: <.refine(isOk)> })      // ['(value: string) => boolean', '{ message?: string } | undefined']
   * ```
   */
  public static _spellParameterTypes({
    call,
  }: SpellParameterTypesArgs): ReadonlyArray<string> | undefined {
    return this.parameterTypes[call.name];
  }

  /**
   * The `Input` and `Output` types of `schema`'s factory call, before any
   * Modifier widens them. Defaults to the factory's name, which is the type
   * of a primitive (`pvl.string()` types as `string`); the other emitters
   * override it.
   */
  public static _spellFactoryTypes({ schema }: SpellTypesArgs): SchemaTypes {
    const type: SpelledType = { text: schema.factory, undefinedness: UNDEFINEDNESS.NEVER };
    return { input: type, output: type };
  }

  /**
   * The `Input` and `Output` types of `schema`, spelled as the interpreted
   * Schema's own inferred types are, as the methods chained before
   * `before` left them. `ChainableSchemaEmitter` widens them for its
   * Modifiers.
   */
  public static _spellTypes(args: SpellTypesArgs): SchemaTypes {
    return this._spellFactoryTypes(args);
  }

  /**
   * A Schema nested in a composite, a field or the element, as the
   * statements checking it where its parent reads it: its value read into
   * its own local, then its checks at `path`, as its Frame composes the
   * parts this emitter emits for it. A value its checks replace
   * (`Frame.replacesValue`) is declared with `let`, any other with `const`.
   *
   * ```ts
   * StringSchemaEmitter.emitNestedSchemaChecks({ schema: <pvl.string().min(3)>, value: 'field0', valueType: undefined, read: 'input1["name"]', path: '[...path1, "name"]', scope })
   * // const field0 = input1["name"];
   * // if (typeof field0 !== "string") {
   * //   issues.push({ code: "INVALID_TYPE", … path: [...path1, "name"] });
   * // } else {
   * //   if (field0.length < 3) { … }
   * // }
   * ArraySchemaEmitter.emitNestedSchemaChecks({ schema: <pvl.array(pvl.string())>, value: 'element1', valueType: 'unknown', read: 'value[index1]', path: '[...path1, index1]', scope })
   * // let element1: unknown = value[index1];
   * // if (!Array.isArray(element1)) {
   * //   issues.push({ code: "INVALID_TYPE", … path: [...path1, index1] });
   * // } else {
   * //   …
   * //   element1 = output2;
   * // }
   * ```
   */
  public static emitNestedSchemaChecks(
    this: SchemaEmitter,
    { schema, value, valueType, read, path, scope }: EmitNestedSchemaChecksArgs,
  ): string {
    const target: CheckingTarget = Frame.createNestedCheckingTarget({ value, path });
    const parts: SchemaParts = this._emitSchemaParts({ schema, target, scope });
    const declarationKeyword = Frame.replacesValue(parts) ? 'let' : 'const';
    const typeAnnotation = valueType === undefined ? '' : `: ${valueType}`;
    return [
      js`${declarationKeyword} ${value}${typeAnnotation} = ${read};`,
      Frame.composeChecks({ target, parts }),
    ].join('\n');
  }

  /**
   * A Compiled Schema, with the type it is cast up to: at the root
   * (`hoistedNameByExpression` set), the expression replacing its
   * `pvl.compile(...)` call, or a Standalone Key's or marked element's (see
   * `emitStandaloneCompiledSchema`). The expression is an instance of a
   * class expression implementing `PvlSchema` (see `COMPILED_SCHEMA_IMPORT`),
   * whose `_validate` checks `schema` at its own parameters exactly as a
   * nested Schema is checked where its parent reads it, then returns the
   * Issues, or the value its checks accepted. Its `Input` and `Output` types
   * are spelled here, its parts are emitted at `Frame.rootCheckingTarget`,
   * and the Frame composes the expression from them, with its Runtime
   * Arguments (`RuntimeArgument.getArgumentParameters`). A composite's also
   * exposes its `shape` or marked `element` (`_emitShapeProperty`,
   * `_emitElementProperty`, ADR-0036, ADR-0039).
   *
   * At the root, its Runtime Arguments are passed in the order they are
   * written, each as written or by the name of the `const` it is hoisted
   * into (`hoistedNameByExpression`), the class is generic in the type
   * parameter of each `.transform()`'s output, and its lines after its
   * first are indented by `indentation`.
   *
   * ```ts
   * ObjectSchemaEmitter.emitCompiledSchema({ schema: <pvl.object({ name: pvl.string() })>, className: 'PvlCompiledSchema0', indentation: '', hoistedNameByExpression: new Map() })
   * // { type: 'PvlSchema<{ name: string }, { name: string }> & { readonly shape: {} }', expression:
   * // (new (class PvlCompiledSchema0 implements PvlSchema<{ name: string }, { name: string }> {
   * //   declare readonly [PVL_SCHEMA_BRAND]: true;
   * //   readonly _standalone: boolean = false;
   * //   readonly shape: {} = {};
   * //   get "~standard"(): … { … }
   * //   validate(value: unknown): PvlResult<{ name: string }> { … }
   * //   _validate(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
   * //     const issues: PvlIssue[] = [];
   * //     if (typeof value !== "object" || …) {
   * //       issues.push({ code: "INVALID_TYPE", … });
   * //     } else {
   * //       …
   * //       value = output1;
   * //     }
   * //     return issues.length > 0 ? { issues } : { value };
   * //   }
   * //   standalone(): this & PvlStandaloneMarker { … }
   * // })() as PvlSchema<{ name: string }, { name: string }> & { readonly shape: {} }) }
   * ```
   */
  public static emitCompiledSchema(
    this: SchemaEmitter,
    { schema, className, indentation, hoistedNameByExpression }: EmitCompiledSchemaArgs,
  ): CompiledSchema {
    return Frame.composeSchema({
      className,
      types: this._spellTypes({ schema }),
      isStandalone: schema.isStandalone,
      indentation,
      runtimeArguments: RuntimeArgument.getArgumentParameters({ schema, hoistedNameByExpression }),
      // A transformed Schema exposes neither, as its value needn't have them (ADR-0016).
      standaloneProperty:
        schema.getTransformFunction() === undefined
          ? (this._emitShapeProperty?.({ schema, className }) ??
            this._emitElementProperty?.({ schema, className }))
          : undefined,
      parts: this._emitSchemaParts({
        schema,
        target: Frame.rootCheckingTarget,
        scope: new Scope(),
      }),
    });
  }

  /**
   * The Compiled Schema of a Standalone Key, or a marked element, of a
   * Compiled Schema whose constructor builds it into its `shape` or
   * `element`: a class expression as `emitCompiledSchema`'s, inlining every
   * check of `schema` on its own, and exposing its own Standalone Keys in
   * turn (ADR-0036). It is written inside its parent, so it is generic in
   * nothing: the root's type parameters are in scope. Each of its Runtime
   * Arguments is passed as the parent holds it (`this.arg0`), so it is
   * still evaluated once, where the root's `pvl.compile(...)` call was.
   *
   * ```ts
   * StringSchemaEmitter.emitStandaloneCompiledSchema({ schema: <pvl.string().max(max).standalone()>, className: 'PvlCompiledSchema0_0' })
   * // { expression: '(new (class PvlCompiledSchema0_0 implements PvlSchema<string, string> { … })(this.arg0) as PvlSchema<string, string> & PvlStandaloneMarker)', type: 'PvlSchema<string, string> & PvlStandaloneMarker' }
   * ```
   */
  public static emitStandaloneCompiledSchema(
    this: SchemaEmitter,
    { schema, className }: EmitStandaloneCompiledSchemaArgs,
  ): CompiledSchema {
    return this.emitCompiledSchema({
      schema,
      className,
      indentation: '',
      hoistedNameByExpression: undefined,
    });
  }

  /**
   * Whether this emitter compiles the Schema method `name`: one of its
   * tables holds a method of that name, its own or one spread from the
   * emitter it extends. Only own keys are read, so a name every object has
   * (`toString`, `__proto__`) is never one.
   *
   * ```ts
   * StringSchemaEmitter.compilesMethod({ name: 'min' })            // true
   * StringSchemaEmitter.compilesMethod({ name: 'optional' })       // true: spread from ChainableSchemaEmitter
   * StringSchemaEmitter.compilesMethod({ name: 'transform' })      // true: spread from ChainableSchemaEmitter
   * EnumSchemaEmitter.compilesMethod({ name: 'coerce' })           // false: an enum has no `.coerce()`
   * ObjectSchemaEmitter.compilesMethod({ name: 'passthrough' })    // true: writing nothing
   * StringSchemaEmitter.compilesMethod({ name: '_emitBaseCheck' }) // false: a hook, held in no table
   * BooleanSchemaEmitter.compilesMethod({ name: 'length' })        // false
   * ```
   */
  public static compilesMethod({ name }: CompilesMethodArgs): boolean {
    return (
      Object.hasOwn(this.preModifierSteps, name) || Object.hasOwn(this.postModifierSteps, name)
    );
  }
}
