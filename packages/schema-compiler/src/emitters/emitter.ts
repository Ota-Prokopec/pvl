// The abstract base class every emitter extends, as every schema of
// `@pvl/schema` extends `Schema`. It does the emitting, following the
// pipeline of ADR-0010: its `_` hooks emit a Schema's parts as source text
// (its composite parts, its base check, its pre-modifiers' parts, its
// post-modifiers' checks, its transform), and `_emitSchemaParts` returns
// them as one `SchemaParts`. A composite's emitter supplies what makes it
// one through `_emitCompositeParts` (locals, declarations, children's
// checks, output statements), and its post-modifiers are handed its output
// local to read. The Frame composes those parts, the same way where a parent
// reads the value and at the root, at `_validate`'s own parameters, where it
// wraps the checks in the Compiled Schema's class (`emitCompiledSchema`). It
// also dispatches each chained method to the emitter method of its name,
// through the table of the kind of text that method writes (ADR-0033), all
// but `.coerce()` and `.transform()`, which have a hook each (ADR-0035).
// Every method whose name starts with `emit` or `_emit` returns source text,
// a string or a list of them (ADR-0028), or, for `_emitSchemaParts`, the
// parts holding it (ADR-0032). A subclass adds the methods mirroring its
// schema's to its tables and overrides the `_` hooks.
import { ISSUE_CODE, type IssueProps } from '@pvl/schema';
import type { Node } from 'ts-morph';
import { RuntimeArgument } from '../schemas/runtimeArgument.js';
import type { Schema } from '../schemas/schema.js';
import type { SchemaModifierCall, SchemaTypes, SpelledType } from '../schemas/schemaTypes.js';
import { PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM } from '@pvl/schema';
import { UNDEFINEDNESS } from '../enums.js';
import type {
  CheckingTarget,
  CompositeLocals,
  CompositeLocalVariableNames,
  CompositeParts,
  EmittedCheck,
  EmittedCoercion,
  EmittedMethodText,
  EmitterMethodTable,
  PostModifierCheckTable,
  PreModifierStep,
  SchemaParts,
  ShortCircuitConditionTable,
  TransformParts,
} from './types.js';
import { emitCheck, js, readCallArguments } from './emitterUtils.js';
import { emitIssue, emitMessageAroundValue, type EmitIssueArgs } from '../issue.js';
import { Frame, type ComposedStructure, type RuntimeArgumentParameter } from '../frame/frame.js';
import { Scope } from '../scope.js';

/** For each method an emitter compiles, the TypeScript type of each of its parameters (see `ParameterTypesOf`). */
type EmitterParameterTypes = Readonly<Partial<Record<string, ReadonlyArray<string>>>>;

/** For each method whose default message names its first argument, that message (see `ArgumentMessagesOf`). */
type EmitterArgumentMessages = Readonly<Partial<Record<string, (value: never) => string>>>;

/** What {@link Emitter.emitTypeCheck} writes a base check from: the condition it fails under, its message, the Issue path it reports at, and its code. */
type EmitTypeCheckArgs = Omit<IssueProps, 'code' | 'path'> & {
  failsWhen: string;
  /** The Issue's path, as an expression: the target's `issuePath`. */
  issuePath: string;
  /** `INVALID_TYPE` unless the check compares the value to fixed values, as `pvl.literal` and `pvl.enum`'s report `INVALID_VALUE`. */
  issueCode?: IssueProps['code'];
};

/** What {@link Emitter._emitPreModifierSteps} emits its pre-modifiers' parts for: a Schema at the target it checks. */
type EmitPreModifierStepsArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
};

/** What {@link Emitter._emitCoercion} emits `.coerce()`'s conversion for: a Schema, and the value it converts, as an expression. */
type EmitCoercionArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
};

/** What {@link Emitter._emitPostModifierChecks} emits its post-modifiers' checks for: a Schema at the target they read, and its composite's locals. */
type EmitPostModifierChecksArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  /** Its own target, or, for a composite, the same with its output local as the value, which its post-modifiers read. */
  target: CheckingTarget;
  /** Its composite's locals, which a post-modifier reading something besides the value reads, as an object's `.strict()` reads its keys; `undefined` for a Schema that isn't a composite. */
  locals?: CompositeLocalVariableNames | undefined;
};

/** What {@link Emitter._emitSchemaParts} emits every part of a Schema's checks for: a Schema at the target it checks, inlined into a parent, or at `Frame.rootCheckingTarget`, as the body of a Compiled Schema's `_validate`. */
export type EmitSchemaPartsArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
  /** Numbers the locals of the Compiled Schema's class the checks are emitted into. */
  scope: Scope;
};

/** What {@link Emitter._emitTransform} emits a Schema's `.transform()` for: a Schema at the target it checks. */
export type EmitTransformHookArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
};

/** What {@link Emitter._spellTypes} and {@link Emitter._spellFactoryTypes} spell types for: the Schema, as the methods chained before `before` left it. */
export type SpellTypesArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  /** The first method whose effect is left out, as a Modifier sees the types the methods before it left; omitted, the whole chain, its `.transform()` included. */
  before?: SchemaModifierCall;
};

/** What {@link Emitter._spellParameterTypes} spells a method's parameter types for: the Schema, and the call. */
export type SpellParameterTypesArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  call: SchemaModifierCall;
};

/** What {@link Emitter.emitNestedSchemaChecks} emits a field's or an element's checks for: its Schema, the local its value is read into, and its path. */
export type EmitNestedSchemaChecksArgs = {
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

/** What {@link Emitter.emitCompiledSchema} writes a class expression for. */
export type EmitCompiledSchemaArgs = {
  /** A Schema `Schema.findUncompilableDiagnostics` found nothing in, which this Emitter compiles. */
  schema: Schema;
  className: string;
  /** The whitespace the line its `pvl.compile(...)` call is on starts with, which every line of the class after its first is indented by. */
  indentation: string;
  /** The name of the hoisted `const` holding each Runtime Argument written outside its `pvl.compile(...)` call, by the argument as written. */
  hoistedNameByExpression: ReadonlyMap<Node, string>;
};

/** What {@link Emitter.emitStandaloneCompiledSchema} writes the Compiled Schema of a Standalone Key or a marked element for. */
export type EmitStandaloneCompiledSchemaArgs = {
  /** The Standalone Key's or the element's Schema. */
  schema: Schema;
  className: string;
  /** Numbers the unmarked elements the root exposes, at any depth, in the order they are reached. */
  nextElementIndex: () => number;
};

/** What `Emitter.emitCompiledSchemaClass` writes a class expression for: at the root, with how its Runtime Arguments are passed, or a Standalone Key's or marked element's, built by its parent. */
type EmitCompiledSchemaClassArgs = EmitStandaloneCompiledSchemaArgs & {
  indentation: string;
  /** Set at the root only. */
  root: Pick<EmitCompiledSchemaArgs, 'hoistedNameByExpression'> | undefined;
};

/** What {@link Emitter._emitCompiledStructure} emits a Compiled Schema's `shape` or `element` for. */
export type EmitCompiledStructureArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  /** The name of its class, which names the classes of what it exposes: `PvlCompiledSchema0_1`. */
  className: string;
  nextElementIndex: () => number;
};

/**
 * An unmarked array element a Compiled Schema exposes as the interpreted
 * Schema it is, which the root's caller passes in, as written (ADR-0036).
 */
export type UnmarkedElement = {
  /** Its number among the root's, which names its type parameter, `TElement0`, and the parameter handing it on, `pvlElement0`. */
  index: number;
  /** The array whose `element` it is. */
  array: Schema;
  /** Its source, which the root's caller evaluates. */
  expression: string;
};

/** A Standalone Key's or marked element's Compiled Schema, as `Emitter.emitStandaloneCompiledSchema` writes it. */
export type StandaloneCompiledSchema = {
  /** The expression building it, a class expression's instance. */
  expression: string;
  /** The type it is cast up to: `PvlSchema<string, string> & PvlStandaloneMarker`. */
  type: string;
  /** The unmarked elements it exposes, at any depth, its constructor takes. */
  elements: ReadonlyArray<UnmarkedElement>;
};

/** A Compiled Schema's `shape` or `element`, as its class holds it (ADR-0036). */
export type CompiledStructure = {
  /** Its type, which the Compiled Schema's type intersects: `{ readonly element: TElement0 }`. */
  type: string;
  /** How the class declares and builds it, `undefined` when its constructor takes it, as an unmarked `element`. */
  composed: ComposedStructure | undefined;
  /** The unmarked elements it exposes, at any depth, which the class's constructor takes, in the order they are numbered. */
  elements: ReadonlyArray<UnmarkedElement>;
};

/** What {@link Emitter.compilesMethod} looks an emitter method up by: the name of the Schema method it mirrors. */
export type CompilesMethodArgs = {
  name: string;
};

/** What {@link Emitter.emitMethodCall} emits a chained method with: the table of the kind of text it writes, the call, and the target it reads. */
export type EmitMethodCallArgs<TOutput extends EmittedMethodText> = {
  table: EmitterMethodTable<TOutput>;
  call: SchemaModifierCall;
  target: CheckingTarget;
};

/** The field an array's Compiled Schema holds its unmarked element in, which its constructor takes. */
const ELEMENT_FIELD_NAME = 'element' as const;

/**
 * The type parameter an unmarked element exposed by a Compiled Schema is
 * typed by, inferred from its source where the root is built.
 *
 * ```ts
 * toElementTypeParameter(0) // 'TElement0'
 * ```
 */
const toElementTypeParameter = (index: number): string => `TElement${String(index)}`;

/**
 * The constructor parameter an unmarked element is handed on to the class
 * exposing it as, through each class between it and the root.
 *
 * ```ts
 * toElementParameterName(1) // 'pvlElement1'
 * ```
 */
const toElementParameterName = (index: number): string => `pvlElement${String(index)}`;

/**
 * The abstract base of every emitter. Its static methods are called on the emitter
 * of the Schema being emitted, so `this` is that emitter:
 * `StringSchemaEmitter._emitSchemaParts({ schema, target, scope })` emits
 * `.min(3)` with `StringSchemaEmitter.postModifierChecks.min`.
 *
 * The methods mirroring a Schema's are held in tables, one per kind of text
 * they write, each spread from the table of the Emitter it extends: a
 * chained method compiles exactly when a table holds a method of its name,
 * or a hook emits it, as `_emitCoercion` does `.coerce()` and
 * `_emitTransform` does `.transform()` (`compilesMethod`). Every method
 * takes one object, so a hook reads only what it needs.
 */
export abstract class Emitter {
  /**
   * The pre-modifiers this emitter compiles, each writing the condition a
   * value short-circuits under, by the name of the method it mirrors.
   * `ChainableSchemaEmitter` adds `.optional()` and `.nullable()`.
   * `.coerce()`, the pre-modifier converting the value, has a hook instead
   * (`_emitCoercion`).
   */
  public static readonly shortCircuitConditions: ShortCircuitConditionTable = {};

  /**
   * The post-modifiers this emitter compiles that check its value, each
   * writing its check, by the name of the method it mirrors. One closed
   * over a Schema's own parts, as an object's `.strict()` is over its keys,
   * is added per Schema by its emitter's `_emitPostModifierChecks`, and
   * named by its `compilesMethod`. `.transform()`, which replaces the value,
   * has a hook instead (`_emitTransform`).
   */
  public static readonly postModifierChecks: PostModifierCheckTable = {};

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
    const composite = this._emitCompositeParts?.(args);
    return {
      baseCheck: this._emitBaseCheck({ schema, target }),
      preModifierSteps: this._emitPreModifierSteps({ schema, target }),
      postModifierChecks: this._emitPostModifierChecks({
        schema,
        target: composite === undefined ? target : { ...target, value: composite.locals.output },
        locals: composite?.locals,
      }),
      composite,
      transform: this._emitTransform?.({ schema, target }),
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
   * StringSchemaEmitter._emitCompositeParts // undefined
   * ArraySchemaEmitter._emitCompositeParts({ schema: <pvl.array(pvl.string())>, target: <field0 at [...path1, "tags"]>, scope })
   * // { locals: <locals ending in 2>, declarations: ['const output2: unknown[] = [];'], childChecks: ['for (let index2 = 0; …) { … }'], setsChildrenApart: false, outputStatements: [] }
   * ```
   */
  protected static _emitCompositeParts?(args: EmitSchemaPartsArgs): CompositeParts;

  /**
   * The hook writing what a Compiled Schema of this Emitter's schema type
   * exposes besides validating: an object's `shape`, holding the Compiled
   * Schema of each Standalone Key, or an array's `element`, its own Compiled
   * Schema when it is marked and else the interpreted Schema it is
   * (ADR-0036). Only a composite's Emitter has one.
   *
   * ```ts
   * ArraySchemaEmitter._emitCompiledStructure({ schema: <pvl.array(pvl.string())>, className: 'PvlCompiledSchema0', nextElementIndex })
   * // { type: '{ readonly element: TElement0 }', composed: undefined, elements: [{ index: 0, array: <pvl.array(…)>, expression: 'pvl.string()' }] }
   * ```
   */
  protected static _emitCompiledStructure?(args: EmitCompiledStructureArgs): CompiledStructure;

  /**
   * The parts of `schema.preModifierCalls` at `target`, in chain order: a
   * short-circuit condition, which a value a pre-modifier accepts holds
   * for, skipping every check after it, or `.coerce()`'s conversion
   * (`_emitCoercion`), which replaces the value, left out where it is the
   * identity.
   *
   * ```ts
   * StringSchemaEmitter._emitPreModifierSteps({ schema: <pvl.string().nullable().coerce().optional()>, target: { value: 'field0', path, issuePath } })
   * // [{ shortCircuitCondition: 'field0 === null' }, { coercion: 'field0 = String(field0);' }, { shortCircuitCondition: 'field0 === undefined' }]
   * ObjectSchemaEmitter._emitPreModifierSteps({ schema: <pvl.object({}).coerce()>, target }) // []
   * ```
   */
  public static _emitPreModifierSteps({
    schema,
    target,
  }: EmitPreModifierStepsArgs): PreModifierStep[] {
    return schema.preModifierCalls.flatMap((call): PreModifierStep[] => {
      if (call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.COERCE) {
        const coercion = this._emitCoercion?.({ schema, target: target });
        return coercion === undefined ? [] : [{ coercion }];
      }
      return [
        {
          shortCircuitCondition: this.emitMethodCall({
            table: this.shortCircuitConditions,
            call,
            target,
          }),
        },
      ];
    });
  }

  /**
   * `.coerce()`'s conversion of `value`, chained onto `schema`, as
   * statements replacing it before its type check. A primitive's emitter
   * has it, writing its conversion (`./coercions.ts`), and a literal's,
   * writing the one of its value's primitive. An emitter without it keeps
   * the identity, as `@pvl/schema`'s base `_coerceInput` is, which an
   * object, an array and an enum keep, and emits nothing.
   *
   * ```ts
   * StringSchemaEmitter._emitCoercion({ schema, value: 'field0' }) // 'field0 = String(field0);'
   * ObjectSchemaEmitter._emitCoercion                              // undefined
   * ```
   */
  public static _emitCoercion?(args: EmitCoercionArgs): EmittedCoercion;

  /**
   * The checks of `schema.postModifierCalls` at `target`, in chain order, as
   * statements, each reporting at its `issuePath` as the base check does: a
   * value one of them fails pushes its Issue. An emitter whose post-modifiers
   * read its composite's `locals` instead of its value, as an object's
   * `.strict()` reads its keys, overrides it.
   *
   * ```ts
   * StringSchemaEmitter._emitPostModifierChecks({ schema: <pvl.string().min(3).max(20)>, target: { value: 'field0', path, issuePath }, locals: undefined })
   * // ['if (field0.length < 3) {\n  issues.push({ code: "TOO_SMALL", … });\n}', 'if (field0.length > 20) {\n  issues.push({ code: "TOO_BIG", … });\n}']
   * ```
   */
  public static _emitPostModifierChecks({
    schema,
    target,
  }: EmitPostModifierChecksArgs): EmittedCheck[] {
    return schema.postModifierCalls.map((call) =>
      this.emitMethodCall({ table: this.postModifierChecks, call, target }),
    );
  }

  /**
   * The call of `schema`'s `.transform()` at `target`, which replaces its
   * value, and the local its gate reads: `undefined` when it has none.
   * `ChainableSchemaEmitter` has it, as it adds `.transform()`.
   */
  public static _emitTransform?(args: EmitTransformHookArgs): TransformParts | undefined;

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
   * The expression a Compiled Schema is, which replaces its `pvl.compile(...)`
   * call: an instance of a class expression implementing `PvlSchema` (see
   * `COMPILED_SCHEMA_IMPORT`), whose `_validate` checks `schema` at its own
   * parameters exactly as a nested Schema is checked where its parent reads
   * it, then returns the Issues, or the value its checks accepted. Its
   * `Input` and `Output` types are spelled here, its parts are emitted at
   * `Frame.rootCheckingTarget`, and the Frame composes the expression. A
   * composite's also exposes its `shape` or `element`
   * (`_emitCompiledStructure`, ADR-0036).
   *
   * Its Runtime Arguments are passed in the order they are written, each as
   * written or by the name of the `const` it is hoisted into
   * (`hoistedNameByExpression`), then each unmarked element it exposes, by
   * its source, and the class's lines after its first are indented by
   * `indentation`.
   *
   * ```ts
   * ObjectSchemaEmitter.emitCompiledSchema({ schema: <pvl.object({ name: pvl.string() })>, className: 'PvlCompiledSchema0', indentation: '', hoistedNameByExpression: new Map() })
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
   * // })() as PvlSchema<{ name: string }, { name: string }> & { readonly shape: {} })
   * ```
   */
  public static emitCompiledSchema(
    this: SchemaEmitter,
    { schema, className, indentation, hoistedNameByExpression }: EmitCompiledSchemaArgs,
  ): string {
    let elementCount = 0;
    return this.emitCompiledSchemaClass({
      schema,
      className,
      indentation,
      root: { hoistedNameByExpression },
      nextElementIndex: () => elementCount++,
    }).expression;
  }

  /**
   * The Compiled Schema of a Standalone Key, or a marked element, of a
   * Compiled Schema whose constructor builds it into its `shape` or
   * `element`: a class expression as `emitCompiledSchema`'s, inlining every
   * check of `schema` on its own, and exposing its own Standalone Keys in
   * turn (ADR-0036). It is written inside its parent, so it is generic in
   * nothing: the root's type parameters are in scope. Each of its Runtime
   * Arguments is passed as the parent holds it (`this.arg0`), so it is
   * still evaluated once, where the root's `pvl.compile(...)` call was, and
   * each unmarked element it exposes by the parameter the parent took it as
   * (`pvlElement1`).
   *
   * ```ts
   * StringSchemaEmitter.emitStandaloneCompiledSchema({ schema: <pvl.string().max(max).standalone()>, className: 'PvlCompiledSchema0_0', nextElementIndex })
   * // { expression: '(new (class PvlCompiledSchema0_0 implements PvlSchema<string, string> { … })(this.arg0) as PvlSchema<string, string> & PvlStandaloneMarker)', type: 'PvlSchema<string, string> & PvlStandaloneMarker', elements: [] }
   * ```
   */
  public static emitStandaloneCompiledSchema(
    this: SchemaEmitter,
    { schema, className, nextElementIndex }: EmitStandaloneCompiledSchemaArgs,
  ): StandaloneCompiledSchema {
    return this.emitCompiledSchemaClass({
      schema,
      className,
      indentation: '',
      root: undefined,
      nextElementIndex,
    });
  }

  /**
   * A Compiled Schema's class expression, at the root (`root` set) or
   * a Standalone Key's or marked element's (see `emitStandaloneCompiledSchema`), with its type
   * and the unmarked elements it exposes. Its `shape` or `element` comes
   * from its Emitter's `_emitCompiledStructure`.
   */
  private static emitCompiledSchemaClass(
    this: SchemaEmitter,
    { schema, className, indentation, root, nextElementIndex }: EmitCompiledSchemaClassArgs,
  ): StandaloneCompiledSchema {
    const types = this._spellTypes({ schema });
    const runtimeArgumentParameters = this.findRuntimeArgumentParameters({ schema }).sort(
      (left, right) => left.runtimeArgument.index - right.runtimeArgument.index,
    );
    const runtimeArguments: RuntimeArgumentParameter[] = runtimeArgumentParameters.map(
      ({ runtimeArgument, type, messageOf }) => ({
        fieldName: runtimeArgument.fieldName,
        type,
        passedExpression:
          root === undefined
            ? js`this.${runtimeArgument.fieldName}`
            : (root.hoistedNameByExpression.get(runtimeArgument.expression) ??
              runtimeArgument.expression.getText()),
        messageField:
          messageOf === undefined
            ? undefined
            : {
                fieldName: runtimeArgument.messageFieldName,
                expression: emitMessageAroundValue(messageOf, runtimeArgument.fieldName),
              },
      }),
    );
    // A transformed Schema exposes neither, as its value needn't have them (ADR-0016).
    const structure =
      schema.transformCall === undefined
        ? this._emitCompiledStructure?.({ schema, className, nextElementIndex })
        : undefined;
    const unmarkedElements = structure?.elements ?? [];
    const type = Frame.spellCompiledSchemaType({
      types,
      isStandalone: schema.isStandalone,
      structureType: structure?.type,
    });
    const expression = Frame.composeSchema({
      className,
      types,
      compiledSchemaType: type,
      isStandalone: schema.isStandalone,
      // In the order their Runtime Arguments are numbered, then the elements'.
      typeParameters:
        root === undefined
          ? []
          : [
              ...runtimeArgumentParameters.flatMap(({ typeParameter }) =>
                typeParameter === undefined ? [] : [typeParameter],
              ),
              ...unmarkedElements.map(({ index }) => toElementTypeParameter(index)),
            ],
      indentation,
      runtimeArguments,
      elementParameters: unmarkedElements.map((element) => {
        const isField = element.array === schema;
        return {
          name: isField ? ELEMENT_FIELD_NAME : toElementParameterName(element.index),
          isField,
          type: toElementTypeParameter(element.index),
          passedExpression:
            root === undefined ? toElementParameterName(element.index) : element.expression,
        };
      }),
      structure: structure?.composed,
      parts: this._emitSchemaParts({
        schema,
        target: Frame.rootCheckingTarget,
        scope: new Scope(),
      }),
    });
    return { expression, type, elements: unmarkedElements };
  }

  /**
   * Every Runtime Argument of the methods chained onto `schema` and onto
   * every Schema nested in it, each with the type of the parameter it is
   * passed as, from its own Schema's emitter (`parameterTypes`), and, when
   * it is a method's first argument, the default message naming it
   * (`argumentMessages`), or, when it is a `.transform()`'s function, the
   * type parameter its return type is inferred as, as the interpreted
   * `.transform<NewOutput>()` infers it. Throws for a parameter with no
   * type, which is a bug in an emitter, never a user error.
   *
   * ```ts
   * StringSchemaEmitter.findRuntimeArgumentParameters({ schema: <pvl.string().max(max, options)> })
   * // [{ runtimeArgument: <max>, type: 'number', messageOf: STRING_SCHEMA_ISSUE_MESSAGE.max, typeParameter: undefined }, { runtimeArgument: <options>, type: '{ message?: string } | undefined', messageOf: undefined, typeParameter: undefined }]
   * StringSchemaEmitter.findRuntimeArgumentParameters({ schema: <pvl.string().transform(trim)> })
   * // [{ runtimeArgument: <trim>, type: '(value: string) => TArg0Output', messageOf: undefined, typeParameter: 'TArg0Output' }]
   * ```
   */
  private static findRuntimeArgumentParameters({ schema }: { schema: Schema }): Array<{
    runtimeArgument: RuntimeArgument;
    type: string;
    messageOf: EmitterArgumentMessages[string];
    typeParameter: string | undefined;
  }> {
    const ownParameters = schema.chainedCalls.flatMap((call) =>
      (call.args ?? []).flatMap((argument, index) => {
        if (!(argument instanceof RuntimeArgument)) {
          return [];
        }
        const type = this._spellParameterTypes({ schema, call })?.[index];
        if (type === undefined) {
          throw new Error(
            `${this.name} has no type for argument ${String(index)} of .${call.name}().`,
          );
        }
        // Only a method's first argument is a value its default message names.
        const messageOf = index === 0 ? this.argumentMessages[call.name] : undefined;
        const typeParameter =
          call === schema.transformCall && index === 0
            ? argument.outputTypeParameterName
            : undefined;
        return [{ runtimeArgument: argument, type, messageOf, typeParameter }];
      }),
    );
    return [
      ...ownParameters,
      ...schema
        .findChildren()
        .flatMap((child) => child.emitter.findRuntimeArgumentParameters({ schema: child })),
    ];
  }

  /**
   * Whether this emitter compiles the Schema method `name`: one of its
   * tables holds a method of that name, its own or one spread from the
   * emitter it extends. Only own keys are read, so a name every object has
   * (`toString`, `__proto__`) is never one. An emitter that emits a method
   * through a hook or calls it itself, rather than dispatching it from a
   * table, overrides it to name that method too.
   *
   * ```ts
   * StringSchemaEmitter.compilesMethod({ name: 'min' })            // true
   * StringSchemaEmitter.compilesMethod({ name: 'optional' })       // true: spread from ChainableSchemaEmitter
   * StringSchemaEmitter.compilesMethod({ name: 'refine' })         // true: spread from ChainableSchemaEmitter
   * StringSchemaEmitter.compilesMethod({ name: 'coerce' })         // true: named by ChainableSchemaEmitter's own
   * StringSchemaEmitter.compilesMethod({ name: '_emitBaseCheck' }) // false: a hook, held in no table
   * BooleanSchemaEmitter.compilesMethod({ name: 'length' })        // false
   * ```
   */
  public static compilesMethod({ name }: CompilesMethodArgs): boolean {
    return (
      Object.hasOwn(this.shortCircuitConditions, name) ||
      Object.hasOwn(this.postModifierChecks, name)
    );
  }

  /**
   * A base check, as every `_emitBaseCheck` writes it: a check that pushes
   * an Issue of `code` with `message` at `issuePath` when `failsWhen` holds.
   * Named after the `_checkType` it compiles, which every interpreted Schema
   * names its base check, a literal's and an enum's value check included.
   *
   * ```ts
   * this.emitTypeCheck({ failsWhen: 'typeof field0 !== "string"', message: 'Expected string', issuePath: '[...path1, "name"]' })
   * // 'if (typeof field0 !== "string") {\n  issues.push({ code: "INVALID_TYPE", message: "Expected string", path: [...path1, "name"] });\n}'
   * ```
   */
  protected static emitTypeCheck({
    failsWhen,
    message,
    issuePath,
    code = ISSUE_CODE.INVALID_TYPE,
  }: EmitTypeCheckArgs): EmittedCheck {
    return emitCheck({ failsWhen, issue: emitIssue({ code, message, path: issuePath }) });
  }

  /**
   * What `call` compiles to, written at `target` by the method of its name
   * in `table`, which holds the methods writing one kind of text: a check
   * such as `.min(3)`'s, or a short-circuit condition such as
   * `.optional()`'s. Typed by the table, so what it writes needs no cast.
   * Only called on a Schema `Schema.findUncompilableDiagnostics` found
   * nothing in, so the method and its arguments are there. Throws when
   * `table` has no method of its name, which is a bug in an emitter, never
   * a user error.
   *
   * ```ts
   * StringSchemaEmitter.emitMethodCall({ table: StringSchemaEmitter.shortCircuitConditions, call: <.optional()>, target: { value: 'field0', path, issuePath } }) // 'field0 === undefined'
   * ```
   */
  protected static emitMethodCall<TOutput extends EmittedMethodText>({
    table,
    call,
    target,
  }: EmitMethodCallArgs<TOutput>): TOutput {
    const emitterMethod = Object.hasOwn(table, call.name) ? table[call.name] : undefined;
    if (emitterMethod === undefined) {
      throw new Error(`${this.name} has no method to emit .${call.name}() with.`);
    }

    return emitterMethod({ target, args: readCallArguments(call) });
  }
}
