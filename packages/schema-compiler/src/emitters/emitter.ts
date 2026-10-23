// The abstract base class every emitter extends, as every schema of
// `@pvl/schema` extends `Schema`. It does the emitting, following the
// pipeline of ADR-0010: its `_` hooks emit a Schema's parts as source text
// (its base check, its pre-modifiers' parts, its post-modifiers' checks,
// its transforms), and `_emitSchemaParts` returns them as one
// `SchemaParts`, which a composite's emitter overrides to add its own
// (locals, declarations, children's checks, output statements). The Frame
// composes those parts, the same way where a parent reads the value and at
// the root, at `_validate`'s own parameters, where it wraps the checks in the
// Compiled Schema's class (`emitCompiledSchema`). It also dispatches each
// chained method to the emitter method of its name, through the table of
// the kind of text that method writes (ADR-0033). Every method whose name
// starts with `emit` or `_emit` returns source text, a string or a list of
// them (ADR-0028), or, for `_emitSchemaParts`, the parts holding it
// (ADR-0032). A subclass adds the methods mirroring its schema's to its
// tables and overrides the `_` hooks.
import { ISSUE_CODE } from '@pvl/schema';
import type { Node } from 'ts-morph';
import { RuntimeArgument } from '../schemas/runtimeArgument.js';
import type { Schema } from '../schemas/schema.js';
import type { SchemaModifierCall, SchemaTypes } from '../schemas/schemaTypes.js';
import type {
  CheckingTarget,
  CoercionTable,
  EmittedCheck,
  EmittedCoercion,
  EmittedMethodText,
  EmitterMethodTable,
  PostModifierCheckTable,
  PreModifierStep,
  SchemaParts,
  ShortCircuitConditionTable,
  TransformParts,
  TransformTable,
} from './emittersTypes.js';
import { emitCheck, js, readCallArguments, readFunctionArgument } from './emitterUtils.js';
import { emitIssue, emitMessageAroundValue, type EmitIssueArgs } from '../issue.js';
import { Frame, type RuntimeArgumentParameter } from './frame.js';
import { Scope } from './scope.js';

/** For each method an emitter compiles, the TypeScript type of each of its parameters (see `ParameterTypesOf`). */
export type EmitterParameterTypes = Readonly<Partial<Record<string, ReadonlyArray<string>>>>;

/** For each method whose default message names its first argument, that message (see `ArgumentMessagesOf`). */
export type EmitterArgumentMessages = Readonly<Partial<Record<string, (value: never) => string>>>;

/** What {@link SchemaEmitter._emitBaseCheck} emits a type check for: a Schema at the target it checks. */
export type EmitBaseCheckArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
};

/** What {@link Emitter.emitTypeCheck} writes a base check from: the condition it fails under, its message, the Issue path it reports at, and its code. */
export type EmitTypeCheckArgs = Omit<EmitIssueArgs, 'code' | 'path'> & {
  failsWhen: string;
  /** The Issue's path, as an expression: the target's `issuePath`. */
  issuePath: string;
  /** `INVALID_TYPE` unless the check compares the value to fixed values, as `pvl.literal` and `pvl.enum`'s report `INVALID_VALUE`. */
  code?: EmitIssueArgs['code'];
};

/** What {@link Emitter._emitPreModifierSteps} emits its pre-modifiers' parts for: a Schema at the target it checks. */
export type EmitPreModifierStepsArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
};

/** What {@link Emitter._emitCoerce} emits a `.coerce()` for: a Schema at the target it checks, and the call. */
export type EmitCoerceArgs<TSchema extends Schema = Schema> = EmitPreModifierStepsArgs<TSchema> & {
  call: SchemaModifierCall;
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

/** What {@link Emitter._emitTransforms} emits a Schema's `.transform()`s for: a Schema at the target it checks. */
export type EmitTransformsArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
};

/** What {@link Emitter.isTransform} and {@link Emitter.spellTransformOutputType} read: a method chained onto a Schema. */
export type TransformCallArgs = {
  call: SchemaModifierCall;
};

/** What {@link Emitter._spellFactoryTypes} spells a factory call's types for: the Schema, as the methods chained before `chainEnd` left it. */
export type SpellFactoryTypesArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  /** The `chainIndex` of the first method whose effect is left out, as a Modifier sees the types the methods before it left; omitted, the whole chain. */
  chainEnd?: number;
};

/** What {@link Emitter._spellTypes} spells types for: the Schema, as the methods chained before `chainEnd` left it. */
export type SpellTypesArgs<TSchema extends Schema = Schema> = SpellFactoryTypesArgs<TSchema>;

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

/** What {@link Emitter.compilesMethod} looks an emitter method up by: the name of the Schema method it mirrors. */
export type CompilesMethodArgs = {
  name: string;
};

/** What {@link Emitter.emitMethodCall} emits a chained method with: the table of the kind of text it writes, the call, and the target it reads. */
export type EmitMethodCallArgs<TOutput extends EmittedMethodText, TInput extends CheckingTarget> = {
  table: EmitterMethodTable<TOutput, TInput>;
  call: SchemaModifierCall;
  target: TInput;
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
 * `.min(3)` with `StringSchemaEmitter.postModifierChecks.min`.
 *
 * The methods mirroring a Schema's are held in tables, one per kind of text
 * they write, each spread from the table of the Emitter it extends: a
 * chained method compiles exactly when a table holds a method of its name.
 * Every method takes one object, so a hook reads only what it needs.
 */
export abstract class Emitter {
  /**
   * The pre-modifiers this emitter compiles, each writing the condition a
   * value short-circuits under, by the name of the method it mirrors.
   * `ChainableSchemaEmitter` adds `.optional()` and `.nullable()`.
   */
  public static readonly shortCircuitConditions: ShortCircuitConditionTable = {};

  /**
   * `.coerce()`, writing the conversion that replaces the value before its
   * type check. `ChainableSchemaEmitter` adds the identity, and an emitter
   * whose schema converts its input overrides it.
   */
  public static readonly coercions: CoercionTable = {};

  /**
   * The post-modifiers this emitter compiles that check its value, each
   * writing its check, by the name of the method it mirrors. A
   * post-modifier reading something else, as an object's `.strict()` reads
   * its keys, sits in a table of its emitter's own instead, which its
   * `_emitSchemaParts` calls it from and its `compilesMethod` reads too.
   */
  public static readonly postModifierChecks: PostModifierCheckTable = {};

  /**
   * `.transform()`, the post-modifier replacing the value rather than
   * checking it, writing its call. `ChainableSchemaEmitter` adds it.
   */
  public static readonly transforms: TransformTable = {};

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
   * its base check, its pre-modifiers' parts, its post-modifiers' checks
   * and its transforms. A composite's
   * emitter overrides it to add its `composite` parts, which is what makes
   * it a composite: it numbers its locals from `scope` first, so before any
   * Schema nested in it, and emits its children's parts with the same
   * `scope`. So does an emitter whose post-modifiers don't all check the
   * value, as an object's `.strict()` checks its keys.
   *
   * ```ts
   * StringSchemaEmitter._emitSchemaParts({ schema: <pvl.string().optional().min(3)>, target: { value: 'field0', path, issuePath }, scope })
   * // { baseCheck: 'if (typeof field0 !== "string") { … }', preModifierSteps: [{ shortCircuitCondition: 'field0 === undefined' }], postModifierChecks: ['if (field0.length < 3) { … }'] }
   * ```
   */
  public static _emitSchemaParts(
    this: SchemaEmitter,
    { schema, target }: EmitSchemaPartsArgs,
  ): SchemaParts {
    return {
      baseCheck: this._emitBaseCheck({ schema, target }),
      preModifierSteps: this._emitPreModifierSteps({ schema, target }),
      postModifierChecks: this._emitPostModifierChecks({ schema, target }),
      transforms: this._emitTransforms({ schema, target }),
    };
  }

  /**
   * The parts of `schema.preModifierCalls` at `target`, in chain order: a
   * short-circuit condition, which a value a pre-modifier accepts holds
   * for, skipping every check after it, or `.coerce()`'s conversion, which
   * replaces the value, left out where it is the identity.
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
      if (!Object.hasOwn(this.coercions, call.name)) {
        return [
          {
            shortCircuitCondition: this.emitMethodCall({
              table: this.shortCircuitConditions,
              call,
              target,
            }),
          },
        ];
      }
      const coercion = this._emitCoerce({ schema, target, call });
      return coercion === '' ? [] : [{ coercion }];
    });
  }

  /**
   * `call`, a `.coerce()` chained onto `schema`, as its conversion at
   * `target`: the method of its name in `coercions`. An emitter whose
   * conversion depends on its Schema, as a literal's on its value's type,
   * overrides it.
   *
   * ```ts
   * StringSchemaEmitter._emitCoerce({ schema, target: { value: 'field0', path, issuePath }, call: <.coerce()> }) // 'field0 = String(field0);'
   * ```
   */
  public static _emitCoerce({ target, call }: EmitCoerceArgs): EmittedCoercion {
    return this.emitMethodCall({ table: this.coercions, call, target });
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
    return schema.postModifierCalls
      .filter((call) => !this.isTransform({ call }))
      .map((call) => this.emitMethodCall({ table: this.postModifierChecks, call, target }));
  }

  /**
   * The calls of `schema`'s `.transform()`s at `target`, in chain order,
   * which replace its value, and the local their gate reads, named after
   * the value: `undefined` when it has none. A Schema whose output is built
   * in a local reads it back from its value, so a composite's run on its
   * output too.
   *
   * ```ts
   * StringSchemaEmitter._emitTransforms({ schema: <pvl.string().transform(trim)>, target: { value: 'field0', path, issuePath } })
   * // { issueCount: 'field0IssueCount', statements: ['field0 = this.arg0.call(undefined, field0 as never);'] }
   * ```
   */
  public static _emitTransforms({
    schema,
    target,
  }: EmitTransformsArgs): TransformParts | undefined {
    const calls = schema.postModifierCalls.filter((call) => this.isTransform({ call }));
    return calls.length === 0
      ? undefined
      : {
          issueCount: `${target.value}IssueCount`,
          statements: calls.map((call) =>
            this.emitMethodCall({ table: this.transforms, call, target }),
          ),
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
  public static _spellFactoryTypes({ schema }: SpellFactoryTypesArgs): SchemaTypes {
    return { input: schema.factory, output: schema.factory };
  }

  /**
   * The `Input` and `Output` types of `schema`, spelled as the interpreted
   * Schema's own inferred types are, as the methods chained before
   * `chainEnd` left them. `ChainableSchemaEmitter` widens them for its
   * Modifiers.
   */
  public static _spellTypes(args: SpellTypesArgs): SchemaTypes {
    return this._spellFactoryTypes(args);
  }

  /**
   * A Schema nested in a composite, a field or the element, as the
   * statements checking it where its parent reads it: its value read into
   * its own local, then its checks at `path`, as its Frame composes the
   * parts this emitter emits for it. A composite's value is declared with
   * `let`, as its checks put the output they build back on it, and so is
   * one `.coerce()` converts or `.transform()` replaces.
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
    // A composite's output, a conversion or a transform replaces the value.
    const declarationKeyword =
      parts.composite === undefined &&
      parts.transforms === undefined &&
      !parts.preModifierSteps.some((step) => 'coercion' in step)
        ? 'const'
        : 'let';
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
      typeParameters: this.findTypeParameters({ schema }),
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
          const type = this._spellParameterTypes({ schema, call })?.[index];
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
   * The type parameter `call`, a `.transform(fn)`, makes a Compiled Schema
   * generic in, which `fn`'s return type is inferred as, as the interpreted
   * `.transform<NewOutput>()` infers it (see `readFunctionArgument`).
   *
   * ```ts
   * Emitter.spellTransformOutputType({ call: <.transform(<the 1st Runtime Argument>)> }) // 'TArg0Output'
   * ```
   */
  protected static spellTransformOutputType({ call }: TransformCallArgs): string {
    const [fn] = call.args ?? [];
    return readFunctionArgument(fn).outputTypeParameterName;
  }

  /**
   * Whether `call` is a `.transform()`, which replaces the value rather than
   * checking it, so it is emitted apart from the post-modifiers' checks.
   */
  protected static isTransform({ call }: TransformCallArgs): boolean {
    return Object.hasOwn(this.transforms, call.name);
  }

  /**
   * The type parameters of `schema`'s Compiled Schema: one per
   * `.transform()` chained onto it or onto a Schema nested in it, in the
   * order their Runtime Arguments are numbered.
   *
   * ```ts
   * ObjectSchemaEmitter.findTypeParameters({ schema: <pvl.object({ age: pvl.string().transform(Number) }).transform(Object.keys)> })
   * // ['TArg0Output', 'TArg1Output']
   * ```
   */
  private static findTypeParameters({ schema }: { schema: Schema }): string[] {
    return [
      ...schema.postModifierCalls
        .filter((call) => this.isTransform({ call }))
        .map((call) => Emitter.spellTransformOutputType({ call })),
      ...schema
        .findChildren()
        .flatMap((child) => child.emitter.findTypeParameters({ schema: child })),
    ].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
  }

  /**
   * Whether this emitter compiles the Schema method `name`: one of its
   * tables holds a method of that name, its own or one spread from the
   * emitter it extends. Only own keys are read, so a name every object has
   * (`toString`, `__proto__`) is never one. An emitter whose
   * `_emitSchemaParts` calls a method itself overrides it to name that
   * method too.
   *
   * ```ts
   * StringSchemaEmitter.compilesMethod({ name: 'min' })            // true
   * StringSchemaEmitter.compilesMethod({ name: 'optional' })       // true: spread from ChainableSchemaEmitter
   * StringSchemaEmitter.compilesMethod({ name: 'refine' })         // true: spread from ChainableSchemaEmitter
   * StringSchemaEmitter.compilesMethod({ name: '_emitBaseCheck' }) // false: a hook, held in no table
   * BooleanSchemaEmitter.compilesMethod({ name: 'length' })        // false
   * ```
   */
  public static compilesMethod({ name }: CompilesMethodArgs): boolean {
    return (
      Object.hasOwn(this.shortCircuitConditions, name) ||
      Object.hasOwn(this.coercions, name) ||
      Object.hasOwn(this.postModifierChecks, name) ||
      Object.hasOwn(this.transforms, name)
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
  protected static emitMethodCall<
    TOutput extends EmittedMethodText,
    TInput extends CheckingTarget,
  >({ table, call, target }: EmitMethodCallArgs<TOutput, TInput>): TOutput {
    const emitterMethod = Object.hasOwn(table, call.name) ? table[call.name] : undefined;
    if (emitterMethod === undefined) {
      throw new Error(`${this.name} has no method to emit .${call.name}() with.`);
    }
    return emitterMethod({ target, args: readCallArguments(call) });
  }
}
