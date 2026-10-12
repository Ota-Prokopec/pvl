// The base class every emitter extends, as every schema of `@pvl/schema`
// extends `Schema`. It does the emitting, following the pipeline of
// ADR-0010: a Schema's pre-modifiers guard its base check, and what runs once
// that check has passed comes after it. It writes those checks where a parent
// reads the value (`emitSchemaChecks`) and at the root, as a Compiled
// Schema's class (`emitCompiledSchema`), both through one body writer and the
// Schema's `EmitFrame`, and dispatches each chained method to
// the emitter method of its name. A subclass adds the methods mirroring its
// schema's and overrides the `_` hooks.
import type { StaticValue } from '../ast/genericAst.js';
import { ROOT_ISSUE_PATH } from '../consts.js';
import type { Schema } from '../schemas/schema.js';
import type { SchemaModifierCall, SchemaTypes } from '../schemas/schemaTypes.js';
import { EmitFrame } from './emitFrame.js';
import { EmitScope } from './emitScope.js';
import type {
  EmittingCheckMethodInput,
  EmittingCheckMethodOutput,
  EmittingCheckMethodOutputWithCheck,
} from './emitterTypes.js';
import { emitBlock, emitCheck } from './emitterUtils.js';

/** An emitter method mirroring a Schema method, as found by name: what it writes is checked once it is called. */
type EmittingMethod = (input: {
  target: EmittingCheckMethodInput;
  args: ReadonlyArray<StaticValue>;
}) => unknown;

// What a Compiled Schema's `_checkType` checks: its `value` parameter, whose
// Issues are reported at its `path` parameter, or at none when it is empty.
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
  scope: EmitScope;
};

/** What {@link Emitter._emitTypedChecks} emits for: a Schema in the frame its checks are inlined in, which holds its target. */
export type EmitTypedChecksArgs<TSchema extends Schema = Schema> = Omit<
  EmitChecksArgs<TSchema>,
  'target'
> & {
  frame: EmitFrame;
};

/** What {@link Emitter.emitBody} writes one Schema's checks for: a Schema at its target, inlined at the root of `_checkType` or into a parent. */
export type EmitBodyArgs = EmitChecksArgs & {
  isRoot: boolean;
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
 * The base of every emitter. Its static methods are called on the emitter
 * of the Schema being emitted, so `this` is that emitter:
 * `StringSchemaEmitter.emitSchemaChecks({ schema, target, scope })` emits
 * `.min(3)` with `StringSchemaEmitter.min`.
 *
 * A static method an emitter below `Emitter` declares mirrors the Schema
 * method of its name, unless its name starts with `_`: those are the hooks
 * a subclass overrides. The methods declared here are never one either.
 * Every method takes one object, so a hook reads only what it needs.
 */
export class Emitter {
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
   * has passed: its post-modifiers' checks, in chain order, placed by the
   * frame. A composite's emitter overrides it to inline its children's
   * checks first, as `_checkType` runs them, then its post-modifiers' once
   * every child has passed, then to build its output, which the frame hands
   * on.
   *
   * ```ts
   * StringSchemaEmitter._emitTypedChecks({ schema: <pvl.string().optional().min(3)>, frame: <frame of field0, nested>, scope })
   * // ['if (field0.length < 3) {\n  issues.push({ code: "TOO_SMALL", … });\n}']
   * StringSchemaEmitter._emitTypedChecks({ schema: <pvl.string().max(2)>, frame: <frame of value, at the root>, scope })
   * // ['if (value.length > 2) {\n  …\n}', 'if (issues.length > 0) {\n  return { issues };\n}']
   * ```
   */
  public static _emitTypedChecks({ schema, frame, scope }: EmitTypedChecksArgs): string[] {
    return frame.emitOnceBaseCheckPassed({
      postModifierChecks: this.emitPostModifierChecks({ schema, target: frame.target, scope }),
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
   * pre-modifiers' conditions.
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
    return this.emitBody({ schema, target, scope, isRoot: false }).join('\n');
  }

  /**
   * The class declaration a Compiled Schema is, extending `PvlSchema` (see
   * `COMPILED_SCHEMA_IMPORT`), whose `_checkType` checks `schema` at its
   * `value`: its checks at the root, which return the first Issues they
   * can, then the value they checked.
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
    const scope = new EmitScope();
    const { input, output } = this._spellTypes({ schema });

    const body = [
      'const issues: PvlIssue[] = [];',
      ...this.emitBody({ schema, target: ROOT_TARGET, scope, isRoot: true }),
    ];

    return [
      `// pvl.compile() on line ${String(line)}`,
      emitBlock({
        head: `class ${className} extends PvlSchema<${input}, ${output}>`,
        body: emitBlock({
          head: 'override _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown>',
          body: body.join('\n'),
        }),
      }),
    ].join('\n');
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
   * One Schema's checks at `target`, as statements, at the root of
   * `_checkType` or where a parent reads its value: its base check, then
   * what `_emitTypedChecks` writes once that has passed, all guarded by its
   * pre-modifiers' conditions, each placed by the Schema's frame (see
   * `EmitFrame.emitChecks`). The frame is created first, so a composite
   * numbers its locals before any Schema nested in it.
   *
   * ```ts
   * StringSchemaEmitter.emitBody({ schema: <pvl.string().max(2)>, target: { value: 'value', issuePath: ROOT_ISSUE_PATH }, scope, isRoot: true })
   * // ['if (typeof value !== "string") { … return { issues }; }', 'if (value.length > 2) { … }', 'if (issues.length > 0) { … }', 'return { value };']
   * ```
   */
  private static emitBody({ schema, target, scope, isRoot }: EmitBodyArgs): string[] {
    const frame = new EmitFrame({ target, scope, isRoot, buildsOutput: this._buildsOutput() });
    return frame.emitChecks({
      baseCheck: this._emitBaseCheck({ schema, target, scope }),
      typedChecks: this._emitTypedChecks({ schema, frame, scope }),
      preModifierConditions: this.emitPreModifierConditions({ schema, target, scope }),
    });
  }

  /**
   * The conditions of `schema.preModifierCalls` at `target`, in chain order,
   * which the rest of its checks run under, as a value a pre-modifier
   * accepts skips them. Throws when one writes a check instead, which is a
   * bug in an emitter, never a user error.
   *
   * ```ts
   * StringSchemaEmitter.emitPreModifierConditions({ schema: <pvl.string().nullable().optional()>, target: { value: 'field0', issuePath }, scope })
   * // ['field0 !== null', 'field0 !== undefined']
   * ```
   */
  private static emitPreModifierConditions({ schema, target }: EmitChecksArgs): string[] {
    return schema.preModifierCalls.map((call) => {
      const condition = this.emitCall({ call, target });
      if (typeof condition !== 'string') {
        throw new Error(`${this.name} wrote a check for .${call.name}(), not a condition.`);
      }
      return condition;
    });
  }
}
