// The base class every emitter extends, as every schema of `@pvl/schema`
// extends `Schema`. It does the emitting: dispatching a chained method to the
// emitter method of the same name, wrapping each check in its `if`, and
// writing a Compiled Schema's class around the body a composite emitter
// writes. A subclass only adds the templates and overrides the `_` hooks.
import type { SchemaMethodCall, SchemaModel, StaticValue } from '../schemaModel.js';
import { js, type EmitTarget, type EmittedCheck, type SchemaTypes } from './utils.js';

const INDENT = '  ' as const;

/** An emitter method mirroring a Schema method: the target first, then the method's own arguments. */
type EmitterMethod = (target: EmitTarget, ...args: ReadonlyArray<StaticValue>) => unknown;

/**
 * Whether an emitter method handed back a check rather than a statement or
 * a condition.
 *
 * ```ts
 * isEmittedCheck({ failsWhen: 'x < 3', issue: '{ … }' }) // true
 * isEmittedCheck('x !== undefined')                       // false
 * ```
 */
const isEmittedCheck = (emitted: unknown): emitted is EmittedCheck => {
  return (
    typeof emitted === 'object' &&
    emitted !== null &&
    typeof Reflect.get(emitted, 'failsWhen') === 'string' &&
    typeof Reflect.get(emitted, 'issue') === 'string'
  );
};

/** What {@link Emitter.emitCompiledSchema} writes a class for. */
export type EmitCompiledSchemaArgs = {
  /** A SchemaModel `findUncompilableDiagnostics` found nothing in. */
  schema: SchemaModel;
  className: string;
  /** The line of the `pvl.compile()` call, named in the class's comment. */
  line: number;
};

/**
 * The base of every emitter. Its static methods are called on the emitter
 * of the Schema being emitted, so `this` is that emitter:
 * `StringSchemaEmitter._emitChecks(schema, target)` dispatches `.min(3)` to
 * `StringSchemaEmitter.min`.
 *
 * A method a subclass declares is a template mirroring a Schema method of
 * the same name, unless its name starts with `_`: `_checkType` and the
 * `_emit…`/`_spell…` hooks a subclass overrides are never a chained method.
 * The methods declared here are never one either.
 */
export class Emitter {
  /**
   * The type check of a flat Schema at a target, taking the target and then
   * the factory's own argument, if it reads one. Every flat emitter
   * overrides it; this one throws, which is a bug in an emitter, never a
   * user error.
   */
  public static _checkType(
    ...[target]: [target: EmitTarget, ...factoryArgs: never[]]
  ): EmittedCheck {
    throw new Error(`${this.name} has no type check to emit for \`${target.value}\`.`);
  }

  /**
   * The type check of `schema` at `target`. Calls `_checkType` with the
   * target alone; an emitter whose type check reads its factory's argument
   * (`pvl.literal('a')`) overrides it to pass that too.
   */
  public static _emitTypeCheck(_schema: SchemaModel, target: EmitTarget): EmittedCheck {
    return this._checkType(target);
  }

  /**
   * Every check of a flat field or element at `target`, inlined, each
   * failure pushed onto `issues`: the type check, then its Constraints in
   * chain order once it has passed. `ChainableSchemaEmitter` wraps it in the
   * Modifiers' guard.
   *
   * ```ts
   * StringSchemaEmitter._emitChecks(<pvl.string().min(3)>, { value: 'field0', path })
   * // if (typeof field0 !== "string") {
   * //   issues.push({ code: "INVALID_TYPE", … });
   * // } else {
   * //   if (field0.length < 3) {
   * //     issues.push({ code: "TOO_SMALL", … });
   * //   }
   * // }
   * ```
   */
  public static _emitChecks(schema: SchemaModel, target: EmitTarget): string {
    const constraintChecks = schema.calls.map((call) => this.emitCallCheck(call, target));
    const typeChecked = Emitter.emitPushIssueIfFails(this._emitTypeCheck(schema, target));
    return constraintChecks.length === 0
      ? typeChecked
      : `${typeChecked} else {\n${Emitter.indent(constraintChecks.map((check) => Emitter.emitPushIssueIfFails(check)).join('\n'))}\n}`;
  }

  /**
   * The body of a Compiled Schema's `_checkType` for a `schema` this emitter
   * compiles at the root. Only a composite's emitter overrides it; this one
   * throws, which is a bug in the compiler, never a user error.
   */
  public static _emitBody(schema: SchemaModel): string {
    throw new Error(`A pvl.${schema.factory}() can't be compiled at the root.`);
  }

  /**
   * The `Input` and `Output` types of `schema` before any Modifier widens
   * them. Defaults to the factory's name, which is the type of a primitive
   * (`pvl.string()` types as `string`); the other emitters override it.
   */
  public static _spellTypes(schema: SchemaModel): SchemaTypes {
    return { input: schema.factory, output: schema.factory };
  }

  /**
   * The `Input` and `Output` types of `schema`, spelled as the interpreted
   * Schema's own inferred types are. `ChainableSchemaEmitter` widens them
   * for its Modifiers.
   */
  public static _emitTypes(schema: SchemaModel): SchemaTypes {
    return this._spellTypes(schema);
  }

  /**
   * This emitter's method mirroring the Schema method `name`, looked up on
   * this emitter and the emitters it extends, below `Emitter`. `undefined`
   * when there is none, so the method isn't compiled yet, or when `name`
   * starts with `_`.
   *
   * ```ts
   * StringSchemaEmitter.findMethod('min')      // StringSchemaEmitter.min
   * StringSchemaEmitter.findMethod('optional') // ChainableSchemaEmitter.optional
   * StringSchemaEmitter.findMethod('refine')   // undefined
   * StringSchemaEmitter.findMethod('_checkType') // undefined
   * ```
   */
  public static findMethod(name: string): EmitterMethod | undefined {
    if (name.startsWith('_')) {
      return undefined;
    }
    for (
      let emitter: unknown = this;
      typeof emitter === 'function' && emitter !== Emitter;
      emitter = Object.getPrototypeOf(emitter)
    ) {
      const method: unknown = Object.hasOwn(emitter, name) ? Reflect.get(emitter, name) : undefined;
      if (typeof method === 'function') {
        return method as EmitterMethod;
      }
    }
    return undefined;
  }

  /**
   * The check `call` compiles to, such as `.min(3)`'s. Only called on a
   * SchemaModel `findUncompilableDiagnostics` found nothing in, so the method
   * and its arguments are there. Throws when the method writes no check,
   * which is a bug in an emitter, never a user error.
   */
  public static emitCallCheck(call: SchemaMethodCall, target: EmitTarget): EmittedCheck {
    const emitted = this.emitCall(call, target);
    if (!isEmittedCheck(emitted)) {
      throw new Error(`The emitter method for .${call.name}() wrote no check.`);
    }
    return emitted;
  }

  /**
   * The source text `call` compiles to: `.optional()`'s condition or
   * `.strict()`'s loop. Throws when the method writes none, which is a bug in
   * an emitter, never a user error.
   */
  public static emitCallText(call: SchemaMethodCall, target: EmitTarget): string {
    const emitted = this.emitCall(call, target);
    if (typeof emitted !== 'string') {
      throw new Error(`The emitter method for .${call.name}() wrote no source text.`);
    }
    return emitted;
  }

  /**
   * The class declaration a Compiled Schema is, extending `PvlSchema` (see
   * `COMPILED_SCHEMA_IMPORT`) with the body this emitter writes for `schema`
   * as its `_checkType`.
   *
   * ```ts
   * ObjectSchemaEmitter.emitCompiledSchema({ schema: <pvl.object({ name: pvl.string() })>, className: 'PvlCompiledSchema0', line: 3 })
   * // // pvl.compile() on line 3
   * // class PvlCompiledSchema0 extends PvlSchema<{ name: string }, { name: string }> {
   * //   override _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> { … }
   * // }
   * ```
   */
  public static emitCompiledSchema({ schema, className, line }: EmitCompiledSchemaArgs): string {
    const { input, output } = this._emitTypes(schema);
    return [
      `// pvl.compile() on line ${String(line)}`,
      Emitter.emitBlock(
        `class ${className} extends PvlSchema<${input}, ${output}>`,
        Emitter.emitBlock(
          'override _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown>',
          this._emitBody(schema),
        ),
      ),
    ].join('\n');
  }

  /**
   * `text` indented one level deeper, blank lines left blank.
   *
   * ```ts
   * Emitter.indent('a;\n\nb;') // '  a;\n\n  b;'
   * ```
   */
  protected static indent(text: string): string {
    return text
      .split('\n')
      .map((line) => (line === '' ? line : `${INDENT}${line}`))
      .join('\n');
  }

  /**
   * A block: `head {`, its body one level deeper, `}`.
   *
   * ```ts
   * Emitter.emitBlock('if (ok)', 'run();') // 'if (ok) {\n  run();\n}'
   * ```
   */
  protected static emitBlock(head: string, body: string): string {
    return `${head} {\n${Emitter.indent(body)}\n}`;
  }

  /**
   * `check` pushing its Issue onto `issues` when it fails.
   *
   * ```ts
   * Emitter.emitPushIssueIfFails({ failsWhen: 'x < 3', issue: '{ … }' })
   * // 'if (x < 3) {\n  issues.push({ … });\n}'
   * ```
   */
  protected static emitPushIssueIfFails({ failsWhen, issue }: EmittedCheck): string {
    return Emitter.emitBlock(js`if (${failsWhen})`, js`issues.push(${issue});`);
  }

  /**
   * `check` returning its Issue when it fails, for the root type check that
   * leaves nothing else to check. Through `issues` rather than a literal
   * array, which TypeScript would check against Standard Schema's own Issue
   * type, which has no `code`.
   *
   * ```ts
   * Emitter.emitReturnIssueIfFails({ failsWhen: '!Array.isArray(value)', issue: '{ … }' })
   * // 'if (!Array.isArray(value)) {\n  issues.push({ … });\n  return { issues };\n}'
   * ```
   */
  protected static emitReturnIssueIfFails({ failsWhen, issue }: EmittedCheck): string {
    return Emitter.emitBlock(
      js`if (${failsWhen})`,
      js`issues.push(${issue});` + '\nreturn { issues };',
    );
  }

  /**
   * The statement returning the Issues collected so far, if there are any.
   *
   * ```ts
   * Emitter.emitReturnIssuesIfAny() // 'if (issues.length > 0) {\n  return { issues };\n}'
   * ```
   */
  protected static emitReturnIssuesIfAny(): string {
    return Emitter.emitBlock('if (issues.length > 0)', 'return { issues };');
  }

  /**
   * What `call`'s emitter method writes for `target`, or `undefined` when
   * this emitter has no method for it.
   */
  private static emitCall(call: SchemaMethodCall, target: EmitTarget): unknown {
    return this.findMethod(call.name)?.(target, ...(call.args ?? []));
  }
}
