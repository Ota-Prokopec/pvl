// The abstract base class every emitter extends, as every schema of
// `@pvl/schema` extends `Schema`. It does the emitting, following the
// pipeline of ADR-0010: its `_` hooks emit a Schema's parts (its
// pre-modifiers' conditions, its base check, and what runs once that check
// has passed: declarations, children's checks, post-modifiers' checks and
// output statements), and the Schema's `Frame` composes them. It hands those
// parts to the Frame where a parent reads the value (`emitSchemaChecks`) and
// at the root, where the Frame writes the Compiled Schema's class
// (`emitCompiledSchema`), both through one body writer, and dispatches each
// chained method to the emitter method of its name. A subclass adds the
// methods mirroring its schema's and overrides the `_` hooks.
import type { StaticValue } from '../ast/genericAst.js';
import { ROOT_ISSUE_PATH } from '../consts.js';
import type { Schema } from '../schemas/schema.js';
import type { SchemaModifierCall, SchemaTypes } from '../schemas/schemaTypes.js';
import type {
  EmittingCheckMethodInput,
  EmittingCheckMethodOutput,
  EmittingCheckMethodOutputWithCheck,
} from './emitterTypes.js';
import { emitCheck, emitReturnValue, js } from './emitterUtils.js';
import { Frame, type FrameCompiledSchema } from './frame.js';
import { Scope } from './scope.js';

/** An emitter method mirroring a Schema method, as found by name: what it writes is checked once it is called. */
type EmittingMethod = (input: {
  target: EmittingCheckMethodInput;
  args: ReadonlyArray<StaticValue>;
}) => unknown;

// What a Compiled Schema's `_checkType` checks: its `value` parameter, whose
// Issues are reported at its `path` parameter, or at none when it is empty,
// as `Frame.composeSchema` names them.
const ROOT_TARGET: EmittingCheckMethodInput = { value: 'value', issuePath: ROOT_ISSUE_PATH };

/**
 * Whether an emitter method wrote a check or source text, as each must.
 *
 * ```ts
 * isEmittingCheckMethodOutput({ failsWhen: 'x < 3', issue: '{ … }' }) // true
 * isEmittingCheckMethodOutput('x !== undefined')                       // true
 * isEmittingCheckMethodOutput(undefined)                               // false
 * ```
 */
const isEmittingCheckMethodOutput = (emitted: unknown): emitted is EmittingCheckMethodOutput => {
  return (
    typeof emitted === 'string' ||
    (typeof emitted === 'object' &&
      emitted !== null &&
      typeof Reflect.get(emitted, 'failsWhen') === 'string' &&
      typeof Reflect.get(emitted, 'issue') === 'string')
  );
};

/** What a hook spells types for: the Schema. */
export type EmitSchemaArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
};

/** What a hook emits checks for: a Schema at the target it checks, numbering its locals from `scope`. */
export type EmitChecksArgs<TSchema extends Schema = Schema> = EmitSchemaArgs<TSchema> & {
  target: EmittingCheckMethodInput;
  /** Numbers the locals of the Compiled Schema's class the checks are emitted into. */
  scope: Scope;
};

/** What {@link Emitter._emitTypedChecks} emits for: a Schema in the frame its checks are composed in, which holds its target. */
export type EmitTypedChecksArgs<TSchema extends Schema = Schema> = Omit<
  EmitChecksArgs<TSchema>,
  'target'
> & {
  frame: Frame;
  /** Whether it is the Schema `pvl.compile()` wraps, its checks `_checkType`'s body. */
  isRoot: boolean;
};

/**
 * What {@link Emitter._emitTypedChecks} emits: the parts of a Schema's checks
 * that run once its base check has passed, each as statements, which its
 * frame composes in this order. A blank line (`''`) among them sets code
 * apart in the output.
 */
export type EmitTypedChecksOutput = {
  /** Locals the other parts read: the frame's own first (`Emitter.emitDeclarations`), then the Emitter's. */
  declarations?: ReadonlyArray<string>;
  /** A composite's children's checks, inlined in order. */
  childChecks?: ReadonlyArray<string>;
  /** Its post-modifiers' checks, in chain order, which the frame gates. */
  postModifierChecks: ReadonlyArray<string>;
  /** What builds a composite's output, before the frame's handoff of it. */
  outputStatements?: ReadonlyArray<string>;
};

/** What {@link Emitter.emitDeclarations} declares a nested composite's locals for. */
export type EmitDeclarationsArgs = {
  frame: Frame;
  isRoot: boolean;
  /** Whether its checks read its path, to report at it or extend it. */
  readsPath: boolean;
  /** Its post-modifiers' checks, which, when there are any, run behind the count of Issues before its children. */
  postModifierChecks: ReadonlyArray<string>;
};

/** What {@link Emitter.emitOutputHandoff} hands a Schema's checked value on from. */
export type EmitOutputHandoffArgs = {
  frame: Frame;
  isRoot: boolean;
};

/** What {@link Emitter.emitBody} writes one Schema's checks for: a Schema at its target, inlined into a parent, or the body of `compiledSchema`'s `_checkType`. */
export type EmitBodyArgs = EmitChecksArgs & {
  compiledSchema?: FrameCompiledSchema;
};

/** What a chained method is emitted for: the call, at the target it checks. */
export type EmitCallArgs = {
  call: SchemaModifierCall;
  target: EmittingCheckMethodInput;
};

/** What {@link Emitter.emitCompiledSchema} writes a class for. */
export type EmitCompiledSchemaArgs = {
  /** A Schema `Schema.findUncompilableDiagnostics` found nothing in, which this Emitter compiles. */
  schema: Schema;
  className: string;
  /** The line of the `pvl.compile()` call, named in the class's comment. */
  line: number;
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
   * The base check of `schema` at `target`: its type check, which every
   * schema's emitter overrides, reading `schema` only when the check needs
   * the factory's argument (`pvl.literal('a')`). This one throws, which is a
   * bug in an emitter, never a user error.
   *
   * ```ts
   * StringSchemaEmitter._emitBaseCheck({ schema, target: { value: 'field0', issuePath }, scope })
   * // { failsWhen: 'typeof field0 !== "string"', issue: '{ code: "INVALID_TYPE", … }' }
   * ```
   */
  public static _emitBaseCheck({ target }: EmitChecksArgs): EmittingCheckMethodOutputWithCheck {
    throw new Error(`${this.name} has no base check to emit for \`${target.value}\`.`);
  }

  /**
   * What is checked of `schema` in `frame` once its type check (base check)
   * has passed, as the parts the frame composes: here, its post-modifiers'
   * checks, in chain order. A composite's emitter overrides it to declare
   * its locals and inline its children's checks too, which `_checkType`
   * runs before its post-modifiers', and to build its output, which the
   * frame hands on.
   *
   * ```ts
   * StringSchemaEmitter._emitTypedChecks({ schema: <pvl.string().optional().min(3)>, frame: <frame of field0, nested>, scope, isRoot: false })
   * // { postModifierChecks: ['if (field0.length < 3) {\n  issues.push({ code: "TOO_SMALL", … });\n}'] }
   * ```
   */
  public static _emitTypedChecks({
    schema,
    frame,
    scope,
  }: EmitTypedChecksArgs): EmitTypedChecksOutput {
    return {
      postModifierChecks: this.emitPostModifierChecks({ schema, target: frame.target, scope }),
    };
  }

  /**
   * The conditions of `schema.preModifierCalls` at `target`, in chain order,
   * which the rest of its checks run under, as a value a pre-modifier
   * accepts skips them. An emitter whose schema adds pre-modifiers of its
   * own overrides it. Throws when one writes a check instead, which is a
   * bug in an emitter, never a user error.
   *
   * ```ts
   * StringSchemaEmitter._emitPreModifierConditions({ schema: <pvl.string().nullable().optional()>, target: { value: 'field0', issuePath }, scope })
   * // ['field0 !== null', 'field0 !== undefined']
   * ```
   */
  public static _emitPreModifierConditions({ schema, target }: EmitChecksArgs): string[] {
    return schema.preModifierCalls.map((call) => {
      const condition = this.emitCall({ call, target });
      if (typeof condition !== 'string') {
        throw new Error(`${this.name} wrote a check for .${call.name}(), not a condition.`);
      }
      return condition;
    });
  }

  /**
   * Whether a Schema's checks build an output that replaces its value, as
   * only a composite's do. Its frame then declares locals for it, numbered
   * when nested, and hands the output on in place of the value. `false`
   * here; a composite's emitter overrides it.
   *
   * ```ts
   * StringSchemaEmitter._buildsOutput() // false
   * ObjectSchemaEmitter._buildsOutput() // true
   * ```
   */
  public static _buildsOutput(): boolean {
    return false;
  }

  /**
   * How a field's or an element's value is declared: `const`, unless its
   * checks build an output, as a composite's do, which its frame puts back
   * on it.
   *
   * ```ts
   * StringSchemaEmitter._spellValueDeclaration() // 'const'
   * ObjectSchemaEmitter._spellValueDeclaration() // 'let'
   * ```
   */
  public static _spellValueDeclaration(): 'const' | 'let' {
    return this._buildsOutput() ? 'let' : 'const';
  }

  /**
   * The `Input` and `Output` types of `schema`'s factory call, before any
   * Modifier widens them. Defaults to the factory's name, which is the type
   * of a primitive (`pvl.string()` types as `string`); the other emitters
   * override it.
   */
  public static _spellFactoryTypes({ schema }: { schema: Schema }): SchemaTypes {
    return { input: schema.factory, output: schema.factory };
  }

  /**
   * The `Input` and `Output` types of `schema`, spelled as the interpreted
   * Schema's own inferred types are. `ChainableSchemaEmitter` widens them
   * for its Modifiers.
   */
  public static _spellTypes(args: EmitSchemaArgs): SchemaTypes {
    return this._spellFactoryTypes(args);
  }

  /**
   * One Schema's checks at `target`, where a parent reads its value, each
   * failure pushed onto `issues`: its base check, then what
   * `_emitTypedChecks` writes once that has passed, all guarded by its
   * pre-modifiers' conditions, as its frame composes them.
   *
   * ```ts
   * StringSchemaEmitter.emitSchemaChecks({ schema: <pvl.string().optional().min(3)>, target: { value: 'field0', issuePath }, scope })
   * // if (field0 !== undefined) {
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
  public static emitSchemaChecks({ schema, target, scope }: EmitChecksArgs): string {
    return this.emitBody({ schema, target, scope }).composeChecks().statements.join('\n');
  }

  /**
   * The class declaration a Compiled Schema is, extending `PvlSchema` (see
   * `COMPILED_SCHEMA_IMPORT`), whose `_checkType` checks `schema` at its
   * `value`: its checks at the root, which return the first Issues they
   * can, then the value they checked. Its `Input` and `Output` types are
   * spelled here, and its frame composes the class.
   *
   * ```ts
   * ObjectSchemaEmitter.emitCompiledSchema({ schema: <pvl.object({ name: pvl.string() })>, className: 'PvlCompiledSchema0', line: 3 })
   * // // pvl.compile() on line 3
   * // class PvlCompiledSchema0 extends PvlSchema<{ name: string }, { name: string }> {
   * //   override _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
   * //     const issues: PvlIssue[] = [];
   * //     if (typeof value !== "object" || …) { … return { issues }; }
   * //     …
   * //     return { value: output };
   * //   }
   * // }
   * ```
   */
  public static emitCompiledSchema({ schema, className, line }: EmitCompiledSchemaArgs): string {
    const types = this._spellTypes({ schema });
    return this.emitBody({
      schema,
      target: ROOT_TARGET,
      scope: new Scope(),
      compiledSchema: { className, line, types },
    }).composeSchema().schema;
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
  public static findEmittingMethod({ name }: { name: string }): EmittingMethod | undefined {
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
   * a check such as `.min(3)`'s, or source text such as `.strict()`'s loop.
   * Only called on a Schema `Schema.findUncompilableDiagnostics` found
   * nothing in, so the method and its arguments are there. Throws when the
   * method writes neither, which is a bug in an emitter, never a user error.
   */
  protected static emitCall({ call, target }: EmitCallArgs): EmittingCheckMethodOutput {
    const emittingMethod = this.findEmittingMethod({ name: call.name });
    const emitted = emittingMethod?.({
      target,
      args: call.args ?? [],
    });

    if (!isEmittingCheckMethodOutput(emitted)) {
      throw new Error(`${this.name} wrote no check for .${call.name}().`);
    }
    return emitted;
  }

  /**
   * The checks of `schema.postModifierCalls` at `target`, in chain order, as
   * statements.
   *
   * ```ts
   * StringSchemaEmitter.emitPostModifierChecks({ schema: <pvl.string().min(3)>, target: { value: 'field0', issuePath }, scope })
   * // ['if (field0.length < 3) {\n  issues.push({ code: "TOO_SMALL", … });\n}']
   * ```
   */
  protected static emitPostModifierChecks({ schema, target }: EmitChecksArgs): string[] {
    return schema.postModifierCalls.map((call) => emitCheck(this.emitCall({ call, target })));
  }

  /**
   * The locals a nested composite declares before its children, which its
   * Emitter puts first among its declarations: its path, when `readsPath`,
   * and the Issue count its frame gates any `postModifierChecks` behind.
   * None at the root, whose path is `_checkType`'s parameter and which
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
  }: EmitDeclarationsArgs): string[] {
    if (isRoot) {
      return [];
    }
    return [
      ...(readsPath ? [js`const ${frame.path} = ${frame.target.issuePath};`] : []),
      ...(postModifierChecks.length > 0 ? [js`const ${frame.issueCount} = issues.length;`] : []),
    ];
  }

  /**
   * The statements handing the checked value on: returned from
   * `_checkType` at the root, as the output a composite's checks built or
   * as `_checkType`'s own `value`; nested, a composite's output is put back
   * on the value its parent reads, and any other value is left as it is.
   *
   * ```ts
   * ObjectSchemaEmitter.emitOutputHandoff({ frame: <frame of value, at the root>, isRoot: true })  // ['return { value: output };']
   * StringSchemaEmitter.emitOutputHandoff({ frame: <frame of value, at the root>, isRoot: true })  // ['return { value };']
   * ObjectSchemaEmitter.emitOutputHandoff({ frame: <frame of field0, nested>, isRoot: false })     // ['field0 = output1;']
   * StringSchemaEmitter.emitOutputHandoff({ frame: <frame of field1, nested>, isRoot: false })     // []
   * ```
   */
  private static emitOutputHandoff({ frame, isRoot }: EmitOutputHandoffArgs): string[] {
    const buildsOutput = this._buildsOutput();
    if (isRoot) {
      return [emitReturnValue(buildsOutput ? frame.output : frame.target.value)];
    }
    return buildsOutput ? [js`${frame.target.value} = ${frame.output};`] : [];
  }

  /**
   * The frame of one Schema at `target`, with every part of its checks set
   * on it, ready to compose: inlined where a parent reads its value, or, with
   * `compiledSchema`, the body of that Compiled Schema's `_checkType`. Each
   * hook emits its parts, and the frame places them (see
   * `Frame.composeChecks`). The frame is created first, so a composite
   * numbers its locals before any Schema nested in it.
   *
   * ```ts
   * StringSchemaEmitter.emitBody({ schema: <pvl.string().max(2)>, target: { value: 'field0', issuePath }, scope }).composeChecks()
   * // { statements: ['if (typeof field0 !== "string") {\n  …\n} else {\n  if (field0.length > 2) { … }\n}'] }
   * ```
   */
  private static emitBody({ schema, target, scope, compiledSchema }: EmitBodyArgs): Frame {
    const isRoot = compiledSchema !== undefined;
    const frame = new Frame({ target, scope, buildsOutput: this._buildsOutput(), compiledSchema });

    frame.setBaseCheck({ baseCheck: this._emitBaseCheck({ schema, target, scope }) });
    const {
      declarations = [],
      childChecks = [],
      postModifierChecks,
      outputStatements = [],
    } = this._emitTypedChecks({ schema, frame, scope, isRoot });
    frame.addDeclarations({ declarations });
    frame.addChildChecks({ childChecks });
    frame.addPostModifierChecks({ postModifierChecks });
    frame.addOutputStatements({
      outputStatements: [...outputStatements, ...this.emitOutputHandoff({ frame, isRoot })],
    });
    frame.addPreModifierConditions({
      preModifierConditions: this._emitPreModifierConditions({ schema, target, scope }),
    });
    return frame;
  }
}
