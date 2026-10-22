// The abstract base class every emitter extends, as every schema of
// `@pvl/schema` extends `Schema`. It does the emitting, following the
// pipeline of ADR-0010: its `_` hooks emit a Schema's parts as source text
// (its base check, its pre-modifiers' short-circuit conditions, its
// post-modifiers' checks), and a composite's adds the rest to the Schema's
// `Frame` (declarations, children's checks, output statements), which
// composes them. It builds that Frame where a parent reads the value
// (`emitSchemaChecks`) and at the root, where the Frame writes the Compiled
// Schema's class (`emitCompiledSchema`), both through `buildFrame`, and
// dispatches each chained method to the emitter method of its name. Every
// method whose name starts with `emit` or `_emit` returns source text, a
// string or a list of them (ADR-0028). A subclass adds the methods mirroring its
// schema's and overrides the `_` hooks.
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
  EmittedOutputStatement,
  EmittedShortCircuitCondition,
  EmittedVariableDeclaration,
} from './emittersTypes.js';
import { emitReturnValue, js } from './emitterUtils.js';
import { emitMessageAroundValue } from '../issue.js';
import { Frame, type FramePosition, type RuntimeArgumentParameter } from './frame.js';
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

/** What {@link Emitter._emitBaseCheck} emits a type check for: a Schema at the target it checks. */
export type EmitBaseCheckArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
  /** Numbers the locals of the Compiled Schema's class the checks are emitted into. */
  scope: Scope;
};

/** What {@link Emitter._emitPostModifierChecks} emits checks for: a Schema in the frame its checks are composed in, which holds its target. */
export type EmitPostModifierChecksArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  frame: Frame;
};

/** What {@link Emitter._emitShortCircuitConditions} emits its pre-modifiers' conditions for: a Schema at the target it checks. */
export type EmitShortCircuitConditionsArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
};

/** What {@link Emitter._addCompositeParts} adds a composite's parts for: a Schema in its frame, with the post-modifiers' checks already emitted for it. */
export type AddCompositePartsArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  frame: Frame;
  /** Numbers the locals of the Compiled Schema's class the checks are emitted into. */
  scope: Scope;
  /** Whether it is the Schema `pvl.compile()` wraps, its checks `_validate`'s body. */
  isRoot: boolean;
  /** Its post-modifiers' checks, which the frame gates behind the count of Issues its declarations take. */
  postModifierChecks: ReadonlyArray<EmittedCheck>;
};

/** What {@link Emitter._spellFactoryTypes} spells a factory call's types for: the Schema. */
export type SpellFactoryTypesArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
};

/** What {@link Emitter._spellTypes} spells types for: the Schema. */
export type SpellTypesArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
};

/** What {@link Emitter.emitSchemaChecks} emits checks for: a Schema at the target its parent reads it at. */
export type EmitSchemaChecksArgs = {
  schema: Schema;
  target: CheckingTarget;
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

/** What {@link Emitter.emitPostModifierCheck} emits a check for: the post-modifier's call, at the target it checks. */
export type EmitPostModifierCheckArgs = {
  call: SchemaModifierCall;
  target: CheckingTarget;
};

/** What {@link Emitter.emitDeclarations} declares a nested composite's locals for. */
export type EmitDeclarationsArgs = {
  frame: Frame;
  isRoot: boolean;
  /** Whether its checks read its path, to report at it or extend it. */
  readsPath: boolean;
  /** Its post-modifiers' checks, which, when there are any, run behind the count of Issues before its children. */
  postModifierChecks: ReadonlyArray<EmittedCheck>;
};

/** What {@link Emitter.emitOutputHandoff} hands a Schema's checked value on from. */
export type EmitOutputHandoffArgs = {
  frame: Frame;
  isRoot: boolean;
};

/** What {@link Emitter.buildFrame} builds one Schema's frame for: a Schema at its target, inlined into a parent, or the body of the `_validate` of the Compiled Schema `compiledSchemaParams` describe, which checks its own parameters. */
export type BuildFrameArgs = FramePosition & {
  schema: Schema;
  /** Numbers the locals of the Compiled Schema's class the checks are emitted into. */
  scope: Scope;
};

/**
 * The abstract base of every emitter. Its static methods are called on the emitter
 * of the Schema being emitted, so `this` is that emitter:
 * `StringSchemaEmitter.emitSchemaChecks({ schema, target, scope })` emits
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
   * The base check of `schema` at `target`: its type check, as a statement,
   * which every schema's emitter overrides, reading `schema` only when the
   * check needs the factory's argument (`pvl.literal('a')`). This one
   * throws, which is a bug in an emitter, never a user error.
   *
   * ```ts
   * StringSchemaEmitter._emitBaseCheck({ schema, target: { value: 'field0', issuePath }, scope })
   * // 'if (typeof field0 !== "string") {\n  issues.push({ code: "INVALID_TYPE", … });\n}'
   * ```
   */
  public static _emitBaseCheck({ target }: EmitBaseCheckArgs): EmittedCheck {
    throw new Error(`${this.name} has no base check to emit for \`${target.value}\`.`);
  }

  /**
   * The checks of `schema.postModifierCalls` in `frame`, in chain order, as
   * statements, each at the frame's value and its own Issue path (`path1`
   * for a nested composite). An emitter whose post-modifiers don't all
   * check that value overrides it, as an object's `.strict()` checks its
   * keys.
   *
   * ```ts
   * StringSchemaEmitter._emitPostModifierChecks({ schema: <pvl.string().min(3)>, frame: <frame of field0, nested> })
   * // ['if (field0.length < 3) {\n  issues.push({ code: "TOO_SMALL", … });\n}']
   * ```
   */
  public static _emitPostModifierChecks({
    schema,
    frame,
  }: EmitPostModifierChecksArgs): EmittedCheck[] {
    const target: CheckingTarget = {
      value: frame.checkingTarget.value,
      issuePath: frame.issuePath,
    };
    return schema.postModifierCalls.map((call) => this.emitPostModifierCheck({ call, target }));
  }

  /**
   * The short-circuit conditions of `schema.preModifierCalls` at `target`,
   * in chain order: a value any one of them holds for is one a pre-modifier
   * accepts, which skips the rest of its checks. An emitter whose schema
   * adds pre-modifiers of its own overrides it.
   *
   * ```ts
   * StringSchemaEmitter._emitShortCircuitConditions({ schema: <pvl.string().nullable().optional()>, target: { value: 'field0', issuePath } })
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
   * Adds to `frame` what a composite checks and builds once its type check
   * (base check) has passed, besides its post-modifiers' checks: its
   * locals, its children's checks, which `_checkType` runs before its
   * post-modifiers', and the statements building its output, which the
   * frame hands on. Only a composite has any, so this one adds nothing,
   * and a composite's emitter overrides it. Throws for a composite whose
   * emitter doesn't, as its frame would hand on an output nothing built,
   * which is a bug in an emitter, never a user error.
   *
   * ```ts
   * StringSchemaEmitter._addCompositeParts({ schema: <pvl.string()>, frame: <frame of field1, nested>, scope, isRoot: false, postModifierChecks: [] })
   * // adds nothing
   * ArraySchemaEmitter._addCompositeParts({ schema: <pvl.array(pvl.string())>, frame: <frame of field0, nested>, scope, isRoot: false, postModifierChecks: [] })
   * // adds the declarations ['const path1 = [...path, "tags"];', 'const output1: unknown[] = [];'], and the loop as its one child's checks
   * ```
   */
  public static _addCompositeParts({ frame }: AddCompositePartsArgs): void {
    if (this._isComposite()) {
      throw new Error(
        `${this.name} is a composite, so it must add the parts of \`${frame.checkingTarget.value}\` that build its output.`,
      );
    }
  }

  /**
   * Whether a Schema is a composite, one holding other Schemas (an object's
   * fields, an array's element). Its checks then build an output that
   * replaces its value, its frame declares locals for it, numbered when
   * nested, and hands the output on in place of the value. `false` here; a
   * composite's emitter overrides it.
   *
   * ```ts
   * StringSchemaEmitter._isComposite() // false
   * ObjectSchemaEmitter._isComposite() // true
   * ```
   */
  public static _isComposite(): boolean {
    return false;
  }

  /**
   * How a field's or an element's value is declared: `const`, unless it is
   * a composite, whose checks build an output its frame puts back on it.
   *
   * ```ts
   * StringSchemaEmitter._spellValueDeclaration() // 'const'
   * ObjectSchemaEmitter._spellValueDeclaration() // 'let'
   * ```
   */
  public static _spellValueDeclaration(): 'const' | 'let' {
    return this._isComposite() ? 'let' : 'const';
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
   * One Schema's checks at `target`, where a parent reads its value, each
   * failure pushed onto `issues`: its base check, then its children's and
   * post-modifiers' checks once that has passed, all guarded by its
   * pre-modifiers' conditions, as its frame composes them.
   *
   * ```ts
   * StringSchemaEmitter.emitSchemaChecks({ schema: <pvl.string().optional().min(3)>, target: { value: 'field0', issuePath }, scope })
   * // if (!((field0 === undefined))) {
   * //   if (typeof field0 !== "string") {
   * //     issues.push({ code: "INVALID_TYPE", … });
   * //   } else {
   * //     if (field0.length < 3) {
   * //       issues.push({ code: "TOO_SMALL", … });
   * //     }
   * //   }
   * // }
   * ```
   */
  public static emitSchemaChecks({ schema, target, scope }: EmitSchemaChecksArgs): string {
    return this.buildFrame({ schema, target, scope }).composeChecks();
  }

  /**
   * The expression a Compiled Schema is, which replaces its `pvl.compile(...)`
   * call: an instance of a class expression implementing `PvlSchema` (see
   * `COMPILED_SCHEMA_IMPORT`), whose `_validate` checks `schema` at its
   * `value`: its checks at the root, which return the first Issues they
   * can, then the value they checked. Its `Input` and `Output` types are
   * spelled here, and its frame composes the expression.
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
   * //       return { value: output };
   * //     }
   * //     return { issues };
   * //   }
   * // })() as PvlSchema<{ name: string }, { name: string }>)
   * ```
   */
  public static emitCompiledSchema({
    schema,
    className,
    indentation,
    hoistedNameByExpression,
  }: EmitCompiledSchemaArgs): string {
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
    return this.buildFrame({
      schema,
      scope: new Scope(),
      compiledSchemaParams: { className, types, indentation, runtimeArguments },
    }).composeSchema();
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
   * StringSchemaEmitter.emitCall({ call: <.optional()>, target: { value: 'field0', issuePath } }) // 'field0 === undefined'
   * ```
   */
  protected static emitCall({ call, target }: EmitCallArgs): string {
    const emittingMethod = this.findEmittingMethod({ name: call.name });
    if (emittingMethod === undefined) {
      throw new Error(`${this.name} has no method to emit .${call.name}() with.`);
    }
    return emittingMethod({ target, args: call.args ?? [] });
  }

  /**
   * What the post-modifier `call` compiles to at `target`, as a statement: a
   * check, or source text such as `.strict()`'s loop.
   *
   * ```ts
   * StringSchemaEmitter.emitPostModifierCheck({ call: <.min(3)>, target: { value: 'field0', issuePath } })
   * // 'if (field0.length < 3) {\n  issues.push({ code: "TOO_SMALL", … });\n}'
   * ```
   */
  protected static emitPostModifierCheck({
    call,
    target,
  }: EmitPostModifierCheckArgs): EmittedCheck {
    return this.emitCall({ call, target }) as EmittedCheck;
  }

  /**
   * The locals a nested composite declares before its children, which its
   * Emitter puts first among its declarations: its path, when `readsPath`,
   * and the Issue count its frame gates any `postModifierChecks` behind.
   * None at the root, whose path is `_validate`'s parameter and which
   * returns its Issues instead.
   *
   * ```ts
   * ArraySchemaEmitter.emitDeclarations({ frame: <frame of field0 at [...path, "tags"], nested>, isRoot: false, readsPath: true, postModifierChecks: [<.min(1)>] })
   * // ['const path1 = [...path, "tags"];', 'const issueCount1 = issues.length;']
   * ArraySchemaEmitter.emitDeclarations({ frame: <frame of value, at the root>, isRoot: true, readsPath: true, postModifierChecks: [<.min(1)>] }) // []
   * ```
   */
  protected static emitDeclarations({
    frame,
    isRoot,
    readsPath,
    postModifierChecks,
  }: EmitDeclarationsArgs): EmittedVariableDeclaration[] {
    if (isRoot) {
      return [];
    }
    return [
      ...(readsPath
        ? [js`const ${frame.pathVariableName} = ${frame.checkingTarget.issuePath};`]
        : []),
      ...(postModifierChecks.length > 0
        ? [js`const ${frame.issueCountVariableName} = issues.length;`]
        : []),
    ] as EmittedVariableDeclaration[];
  }

  /**
   * The statements handing the checked value on: returned from
   * `_validate` at the root, as the output a composite's checks built or
   * as `_validate`'s own `value`; nested, a composite's output is put back
   * on the value its parent reads, and any other value is left as it is.
   *
   * ```ts
   * ObjectSchemaEmitter.emitOutputHandoff({ frame: <frame of value, at the root>, isRoot: true })  // ['return { value: output };']
   * StringSchemaEmitter.emitOutputHandoff({ frame: <frame of value, at the root>, isRoot: true })  // ['return { value: value };']
   * ObjectSchemaEmitter.emitOutputHandoff({ frame: <frame of field0, nested>, isRoot: false })     // ['field0 = output1;']
   * StringSchemaEmitter.emitOutputHandoff({ frame: <frame of field1, nested>, isRoot: false })     // []
   * ```
   */
  private static emitOutputHandoff({
    frame,
    isRoot,
  }: EmitOutputHandoffArgs): EmittedOutputStatement[] {
    const isComposite = this._isComposite();
    if (isRoot) {
      return [emitReturnValue(isComposite ? frame.outputVariableName : frame.checkingTarget.value)];
    }
    return isComposite
      ? [js`${frame.checkingTarget.value} = ${frame.outputVariableName};` as EmittedOutputStatement]
      : [];
  }

  /**
   * The frame of one Schema at `target`, with every part of its checks set
   * on it, ready to compose: inlined where a parent reads its value, or, with
   * `compiledSchemaParams`, the body of that Compiled Schema's `_validate`,
   * at the target the frame builds from its parameters.
   * Each hook emits its parts, or adds a composite's, and the frame places
   * them (see `Frame.composeChecks`), the output's handoff last among the
   * output statements. The frame is created first, so a composite numbers
   * its locals before any Schema nested in it.
   *
   * ```ts
   * StringSchemaEmitter.buildFrame({ schema: <pvl.string().max(2)>, target: { value: 'field0', issuePath }, scope }).composeChecks()
   * // 'if (typeof field0 !== "string") {\n  …\n} else {\n  if (field0.length > 2) { … }\n}'
   * ```
   */
  private static buildFrame({ schema, scope, ...position }: BuildFrameArgs): Frame {
    const isRoot = position.compiledSchemaParams !== undefined;
    const frame = new Frame({ ...position, scope, isComposite: this._isComposite() });
    const target = frame.checkingTarget;

    frame.setBaseCheck(this._emitBaseCheck({ schema, target, scope }));
    frame.addShortCircuitConditions(...this._emitShortCircuitConditions({ schema, target }));
    const postModifierChecks = this._emitPostModifierChecks({ schema, frame });
    frame.addPostModifierChecks(...postModifierChecks);
    this._addCompositeParts({ schema, frame, scope, isRoot, postModifierChecks });
    frame.addOutputStatements(...this.emitOutputHandoff({ frame, isRoot }));
    return frame;
  }
}
