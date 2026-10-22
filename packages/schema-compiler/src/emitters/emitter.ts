// The abstract base class every emitter extends, as every schema of
// `@pvl/schema` extends `Schema`. It does the emitting, following the
// pipeline of ADR-0010: its `_` hooks emit a Schema's parts as source text
// (its base check, its pre-modifiers' short-circuit conditions, its
// post-modifiers' checks), and `_emitSchemaParts` returns them as one
// `SchemaParts`, which a composite's emitter overrides to add its own
// (locals, declarations, children's checks, output statements). The Frame
// composes those parts, the same way where a parent reads the value and at
// the root, at `_validate`'s own parameters, where it wraps the checks in the
// Compiled Schema's class (`emitCompiledSchema`). It also dispatches each
// chained method to the emitter method of its name. Every method whose name
// starts with `emit` or `_emit` returns source text, a string or a list of
// them (ADR-0028), or, for `_emitSchemaParts`, the parts holding it
// (ADR-0032). A subclass adds the methods mirroring its schema's and
// overrides the `_` hooks.
import type { Node } from 'ts-morph';
import { RuntimeArgument } from '../schemas/runtimeArgument.js';
import type { Schema } from '../schemas/schema.js';
import type {
  SchemaModifierCall,
  SchemaModifierCallArgument,
  SchemaTypes,
} from '../schemas/schemaTypes.js';
import type {
  CheckingTarget,
  EmittedCheck,
  EmittedShortCircuitCondition,
  SchemaParts,
} from './emittersTypes.js';
import { js } from './emitterUtils.js';
import { emitMessageAroundValue } from '../issue.js';
import { Frame, type RuntimeArgumentParameter } from './frame.js';
import { Scope } from './scope.js';

/** An emitter method mirroring a Schema method, as found by name: the source text it writes, typed by `EmitterMethodOf`. */
type EmittingMethod = (input: {
  target: CheckingTarget;
  args: ReadonlyArray<SchemaModifierCallArgument>;
}) => string;

/** For each method an emitter compiles, the TypeScript type of each of its parameters (see `ParameterTypesOf`). */
export type EmitterParameterTypes = Readonly<Partial<Record<string, ReadonlyArray<string>>>>;

/** For each method whose default message names its first argument, that message (see `ArgumentMessagesOf`). */
export type EmitterArgumentMessages = Readonly<Partial<Record<string, (value: never) => string>>>;

/** What {@link SchemaEmitter._emitBaseCheck} emits a type check for: a Schema at the target it checks. */
export type EmitBaseCheckArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
};

/** What {@link Emitter._emitShortCircuitConditions} emits its pre-modifiers' conditions for: a Schema at the target it checks. */
export type EmitShortCircuitConditionsArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
};

/** What {@link Emitter._emitPostModifierChecks} emits its post-modifiers' checks for: a Schema at the target it checks. */
export type EmitPostModifierChecksArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
};

/** What {@link Emitter._emitSchemaParts} emits every part of a Schema's checks for: a Schema at the target it checks, inlined into a parent, or at `Frame.rootCheckingTarget`, as the body of a Compiled Schema's `_validate`. */
export type EmitSchemaPartsArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
  /** Numbers the locals of the Compiled Schema's class the checks are emitted into. */
  scope: Scope;
};

/** What {@link Emitter._spellFactoryTypes} spells a factory call's types for: the Schema. */
export type SpellFactoryTypesArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
};

/** What {@link Emitter._spellTypes} spells types for: the Schema. */
export type SpellTypesArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
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

/** What {@link Emitter.findEmittingMethod} looks an emitter method up by: the name of the Schema method it mirrors. */
export type FindEmittingMethodArgs = {
  name: string;
};

/** What {@link Emitter.emitCall} emits a chained method for: the call, at the target it checks. */
export type EmitCallArgs = {
  call: SchemaModifierCall;
  target: CheckingTarget;
};

/**
 * An Emitter a Schema subclass compiles with (`Schema.emitter`): `Emitter`'s
 * static methods, plus the base check of its schema type, which every such
 * Emitter writes. TypeScript has no abstract static method, so this type
 * stands in for one: naming an Emitter without `_emitBaseCheck` as a
 * Schema subclass's, or emitting a Schema's parts with one, is a type
 * error.
 */
export type SchemaEmitter = typeof Emitter & {
  /**
   * The base check of `schema` at `target`: its type check, as a
   * statement, reading `schema` only when the check needs the factory's
   * argument (`pvl.literal('a')`).
   *
   * ```ts
   * StringSchemaEmitter._emitBaseCheck({ schema, target: { value: 'field0', path, issuePath } })
   * // 'if (typeof field0 !== "string") {\n  issues.push({ code: "INVALID_TYPE", … });\n}'
   * ```
   */
  // A method, not a function-typed property, so an Emitter's own may take
  // the Schema subclass it compiles (`EmitBaseCheckArgs<EnumSchema>`), as
  // an override of every other hook does.
  _emitBaseCheck(args: EmitBaseCheckArgs): EmittedCheck;
};

/**
 * The abstract base of every emitter. Its static methods are called on the emitter
 * of the Schema being emitted, so `this` is that emitter:
 * `StringSchemaEmitter._emitSchemaParts({ schema, target, scope })` emits
 * `.min(3)` with `StringSchemaEmitter.min`.
 *
 * A static method an emitter below `Emitter` declares mirrors the Schema
 * method of its name, unless its name starts with `_`: those are the hooks
 * a subclass overrides. The methods declared here are never one either.
 * Every method takes one object, so a hook reads only what it needs.
 */
export abstract class Emitter {
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
   * its base check, its pre-modifiers' short-circuit conditions and its
   * post-modifiers' checks. A composite's
   * emitter overrides it to add its `composite` parts, which is what makes
   * it a composite: it numbers its locals from `scope` first, so before any
   * Schema nested in it, and emits its children's parts with the same
   * `scope`. So does an emitter whose post-modifiers don't all check the
   * value, as an object's `.strict()` checks its keys.
   *
   * ```ts
   * StringSchemaEmitter._emitSchemaParts({ schema: <pvl.string().optional().min(3)>, target: { value: 'field0', path, issuePath }, scope })
   * // { baseCheck: 'if (typeof field0 !== "string") { … }', shortCircuitConditions: ['field0 === undefined'], postModifierChecks: ['if (field0.length < 3) { … }'] }
   * ```
   */
  public static _emitSchemaParts(
    this: SchemaEmitter,
    { schema, target }: EmitSchemaPartsArgs,
  ): SchemaParts {
    return {
      baseCheck: this._emitBaseCheck({ schema, target }),
      shortCircuitConditions: this._emitShortCircuitConditions({ schema, target }),
      postModifierChecks: this._emitPostModifierChecks({ schema, target }),
    };
  }

  /**
   * The short-circuit conditions of `schema.preModifierCalls` at `target`,
   * in chain order: a value any one of them holds for is one a pre-modifier
   * accepts, which skips the rest of its checks. An emitter whose schema
   * adds pre-modifiers of its own overrides it.
   *
   * ```ts
   * StringSchemaEmitter._emitShortCircuitConditions({ schema: <pvl.string().nullable().optional()>, target: { value: 'field0', path, issuePath } })
   * // ['field0 === null', 'field0 === undefined']
   * ```
   */
  public static _emitShortCircuitConditions({
    schema,
    target,
  }: EmitShortCircuitConditionsArgs): EmittedShortCircuitCondition[] {
    return schema.preModifierCalls.map(
      (call) => this.emitCall({ call, target }) as EmittedShortCircuitCondition,
    );
  }

  /**
   * The checks of `schema.postModifierCalls` at `target`, in chain order, as
   * statements, each reporting at its `issuePath` as the base check does: a
   * value one of them fails pushes its Issue. An emitter whose post-modifiers
   * read its composite's locals instead of its value, as an object's
   * `.strict()` reads its keys, writes them in its `_emitSchemaParts`.
   *
   * ```ts
   * StringSchemaEmitter._emitPostModifierChecks({ schema: <pvl.string().min(3).max(20)>, target: { value: 'field0', path, issuePath } })
   * // ['if (field0.length < 3) {\n  issues.push({ code: "TOO_SMALL", … });\n}', 'if (field0.length > 20) {\n  issues.push({ code: "TOO_BIG", … });\n}']
   * ```
   */
  public static _emitPostModifierChecks({
    schema,
    target,
  }: EmitPostModifierChecksArgs): EmittedCheck[] {
    return schema.postModifierCalls.map((call) => this.emitCall({ call, target }) as EmittedCheck);
  }

  /**
   * The `Input` and `Output` types of `schema`'s factory call, before any
   * Modifier widens them. Defaults to the factory's name, which is the type
   * of a primitive (`pvl.string()` types as `string`); the other emitters
   * override it.
   */
  public static _spellFactoryTypes({ schema }: SpellFactoryTypesArgs): SchemaTypes {
    return { input: schema.factory, output: schema.factory };
  }

  /**
   * The `Input` and `Output` types of `schema`, spelled as the interpreted
   * Schema's own inferred types are. `ChainableSchemaEmitter` widens them
   * for its Modifiers.
   */
  public static _spellTypes(args: SpellTypesArgs): SchemaTypes {
    return this._spellFactoryTypes(args);
  }

  /**
   * A Schema nested in a composite, a field or the element, as the
   * statements checking it where its parent reads it: its value read into
   * its own local, then its checks at `path`, as its Frame composes the
   * parts this emitter emits for it. A composite's value is declared with
   * `let`, as its checks put the output they build back on it.
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
    const declarationKeyword = parts.composite === undefined ? 'const' : 'let';
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
   * `Frame.rootCheckingTarget`, and the Frame composes the expression.
   *
   * Its Runtime Arguments are passed in the order they are written, each as
   * written or by the name of the `const` it is hoisted into
   * (`hoistedNameByExpression`), and the class's lines after its first are
   * indented by `indentation`.
   *
   * ```ts
   * ObjectSchemaEmitter.emitCompiledSchema({ schema: <pvl.object({ name: pvl.string() })>, className: 'PvlCompiledSchema0', indentation: '', hoistedNameByExpression: new Map() })
   * // (new (class PvlCompiledSchema0 implements PvlSchema<{ name: string }, { name: string }> {
   * //   declare readonly [PVL_SCHEMA_BRAND]: true;
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
   * // })() as PvlSchema<{ name: string }, { name: string }>)
   * ```
   */
  public static emitCompiledSchema(
    this: SchemaEmitter,
    { schema, className, indentation, hoistedNameByExpression }: EmitCompiledSchemaArgs,
  ): string {
    const types = this._spellTypes({ schema });
    const runtimeArguments: RuntimeArgumentParameter[] = this.findRuntimeArgumentParameters({
      schema,
    })
      .sort((left, right) => left.runtimeArgument.index - right.runtimeArgument.index)
      .map(({ runtimeArgument, type, messageOf }) => ({
        fieldName: runtimeArgument.fieldName,
        type,
        passedExpression:
          hoistedNameByExpression.get(runtimeArgument.expression) ??
          runtimeArgument.expression.getText(),
        messageField:
          messageOf === undefined
            ? undefined
            : {
                fieldName: runtimeArgument.messageFieldName,
                expression: emitMessageAroundValue(messageOf, runtimeArgument.fieldName),
              },
      }));
    return Frame.composeSchema({
      className,
      types,
      indentation,
      runtimeArguments,
      parts: this._emitSchemaParts({
        schema,
        target: Frame.rootCheckingTarget,
        scope: new Scope(),
      }),
    });
  }

  /**
   * Every Runtime Argument of the methods chained onto `schema` and onto
   * every Schema nested in it, each with the type of the parameter it is
   * passed as, from its own Schema's emitter (`parameterTypes`), and, when
   * it is a method's first argument, the default message naming it
   * (`argumentMessages`). Throws for a parameter with no type, which is a
   * bug in an emitter, never a user error.
   *
   * ```ts
   * StringSchemaEmitter.findRuntimeArgumentParameters({ schema: <pvl.string().max(max, options)> })
   * // [{ runtimeArgument: <max>, type: 'number', messageOf: STRING_SCHEMA_ISSUE_MESSAGE.max }, { runtimeArgument: <options>, type: '{ message?: string } | undefined', messageOf: undefined }]
   * ```
   */
  private static findRuntimeArgumentParameters({ schema }: { schema: Schema }): Array<{
    runtimeArgument: RuntimeArgument;
    type: string;
    messageOf: EmitterArgumentMessages[string];
  }> {
    const ownParameters = [...schema.preModifierCalls, ...schema.postModifierCalls].flatMap(
      (call) =>
        (call.args ?? []).flatMap((argument, index) => {
          if (!(argument instanceof RuntimeArgument)) {
            return [];
          }
          const type = this.parameterTypes[call.name]?.[index];
          if (type === undefined) {
            throw new Error(
              `${this.name} has no type for argument ${String(index)} of .${call.name}().`,
            );
          }
          // Only a method's first argument is a value its default message names.
          const messageOf = index === 0 ? this.argumentMessages[call.name] : undefined;
          return [{ runtimeArgument: argument, type, messageOf }];
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
   * This emitter's method mirroring the Schema method `name`: its own, or
   * else the one of the emitter it extends, down to `Emitter`, which has
   * none. `undefined` when no emitter has one, so the method isn't compiled
   * yet, or when `name` starts with `_`. Only own properties are read, so a
   * name every class has (`toString`, `caller`) is never one.
   *
   * ```ts
   * StringSchemaEmitter.findEmittingMethod({ name: 'min' })           // StringSchemaEmitter.min
   * StringSchemaEmitter.findEmittingMethod({ name: 'optional' })      // ChainableSchemaEmitter.optional
   * StringSchemaEmitter.findEmittingMethod({ name: 'refine' })        // undefined
   * StringSchemaEmitter.findEmittingMethod({ name: '_emitBaseCheck' }) // undefined
   * BooleanSchemaEmitter.findEmittingMethod({ name: 'length' })       // undefined: only its own `length` number
   * ```
   */
  public static findEmittingMethod({ name }: FindEmittingMethodArgs): EmittingMethod | undefined {
    if (this === Emitter || name.startsWith('_')) {
      return undefined;
    }
    const method: unknown = Object.getOwnPropertyDescriptor(this, name)?.value;
    if (typeof method === 'function') {
      return method as EmittingMethod;
    }
    const extendedEmitter: typeof Emitter = Object.getPrototypeOf(this);
    return extendedEmitter.findEmittingMethod({ name });
  }

  /**
   * What `call` compiles to, written by this emitter's method of its name:
   * a check such as `.min(3)`'s, a short-circuit condition such as
   * `.optional()`'s, or a statement building the output such as
   * `.passthrough()`'s loop. Only called on a Schema
   * `Schema.findUncompilableDiagnostics` found nothing in, so the method and
   * its arguments are there. Throws when no emitter has the method, which
   * is a bug in an emitter, never a user error.
   *
   * ```ts
   * StringSchemaEmitter.emitCall({ call: <.optional()>, target: { value: 'field0', path, issuePath } }) // 'field0 === undefined'
   * ```
   */
  protected static emitCall({ call, target }: EmitCallArgs): string {
    const emittingMethod = this.findEmittingMethod({ name: call.name });
    if (emittingMethod === undefined) {
      throw new Error(`${this.name} has no method to emit .${call.name}() with.`);
    }
    return emittingMethod({ target, args: call.args ?? [] });
  }
}
