// The base class every emitter extends, as every schema of `@pvl/schema`
// extends `Schema`. It does the emitting: one Schema's checks are its base
// check, its pre-modifiers' and its post-modifiers' (ADR-0010), each got by
// its own hook, turned into source text by `emitCheck` and put together by
// `emitSchemaChecks`. It also writes a Compiled Schema's class around the body
// a composite emitter writes. A subclass only adds the templates and
// overrides the `_` hooks.
import type { Schema } from '../schemas/schema.js';
import type { SchemaModifierCall } from '../schemas/schemaTypes.js';
import { EmitScope } from './emitScope.js';
import type {
  EmittingCheckMethodInput,
  EmittingCheckMethodOutput,
  EmittingCheckMethodOutputWithCheck,
} from './emittersTypes.js';
import { js, type SchemaTypes } from './utils.js';

const INDENT = '  ' as const;

/** An emitter method mirroring a Schema method: the target, and the method's own arguments. */
type EmitterMethod = (input: {
  target: EmittingCheckMethodInput;
  args: NonNullable<SchemaModifierCall['args']>;
}) => unknown;

/**
 * Whether an emitter method handed back a check or source text.
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

/** What a hook emits for: the Schema, and the scope that numbers the locals of the class it is emitted into. */
export type EmitSchemaArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  scope: EmitScope;
};

/** What a hook emits checks for: a Schema, at the target it checks. */
export type EmitChecksArgs<TSchema extends Schema = Schema> = EmitSchemaArgs<TSchema> & {
  target: EmittingCheckMethodInput;
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
 * `StringSchemaEmitter.emitSchemaChecks({ schema, target, scope })` dispatches
 * `.min(3)` to `StringSchemaEmitter.min`.
 *
 * A method a subclass declares is a template mirroring a Schema method of
 * the same name, unless its name starts with `_`: the `_get…`/`_emit…`/
 * `_spell…` hooks a subclass overrides are never a chained method.
 * The methods declared here are never one either. Every method takes one
 * object, so a hook reads only the properties it needs.
 */
export class Emitter {
  /**
   * The base check of `schema` at `target`: its type check, run between the
   * pre-modifiers and the post-modifiers. Every schema's emitter overrides
   * it, reading `schema` only when its check needs the factory's argument
   * (`pvl.literal('a')`); this one throws, which is a bug in an emitter,
   * never a user error.
   *
   * ```ts
   * StringSchemaEmitter._getBaseCheck({ schema, target: { value: 'field0', issuePath }, scope })
   * // { failsWhen: 'typeof field0 !== "string"', issue: '{ code: "INVALID_TYPE", … }' }
   * ```
   */
  public static _getBaseCheck({ target }: EmitChecksArgs): EmittingCheckMethodOutputWithCheck {
    throw new Error(`${this.name} has no base check to emit for \`${target.value}\`.`);
  }

  /**
   * The checks of `schema.preModifierCalls` at `target`, in chain order: each
   * one the condition the rest of its checks run under, as a value it
   * accepts skips them.
   *
   * ```ts
   * StringSchemaEmitter._getPreModifierChecks({ schema: <pvl.string().optional().min(3)>, target: { value: 'field0', issuePath }, scope })
   * // ['field0 !== undefined']
   * ```
   */
  public static _getPreModifierChecks({ schema, target }: EmitChecksArgs): string[] {
    return schema.preModifierCalls.map((call) => this.emitCallText({ call, target }));
  }

  /**
   * The checks of `schema.postModifierCalls` at `target`, in chain order,
   * run once its base check has passed. A composite's
   * emitter overrides it to inline its fields' or element's checks and put
   * the output it builds back on `target`.
   *
   * ```ts
   * StringSchemaEmitter._getPostModifierChecks({ schema: <pvl.string().optional().min(3)>, target: { value: 'field0', issuePath }, scope })
   * // [{ failsWhen: 'field0.length < 3', issue: '{ code: "TOO_SMALL", … }' }]
   * ```
   */
  public static _getPostModifierChecks({
    schema,
    target,
  }: EmitChecksArgs): EmittingCheckMethodOutput[] {
    return schema.postModifierCalls.map((call) => this.emitCall({ call, target }));
  }

  /**
   * How a field's or an element's value is declared: `const`, unless its
   * checks replace it with the output they build, as a composite's do.
   *
   * ```ts
   * StringSchemaEmitter._spellValueDeclaration() // 'const'
   * ObjectSchemaEmitter._spellValueDeclaration() // 'let'
   * ```
   */
  public static _spellValueDeclaration(): 'const' | 'let' {
    return 'const';
  }

  /**
   * The body of a Compiled Schema's `_checkType` for a `schema` this emitter
   * compiles at the root. Only a composite's emitter overrides it; this one
   * throws, which is a bug in the compiler, never a user error.
   */
  public static _emitBody({ schema }: EmitSchemaArgs): string {
    throw new Error(`A pvl.${schema.factory}() can't be compiled at the root.`);
  }

  /**
   * The `Input` and `Output` types of `schema` before any Modifier widens
   * them. Defaults to the factory's name, which is the type of a primitive
   * (`pvl.string()` types as `string`); the other emitters override it.
   */
  public static _spellTypes({ schema }: EmitSchemaArgs): SchemaTypes {
    return { input: schema.factory, output: schema.factory };
  }

  /**
   * The `Input` and `Output` types of `schema`, spelled as the interpreted
   * Schema's own inferred types are. `ChainableSchemaEmitter` widens them
   * for its Modifiers.
   */
  public static _emitTypes(args: EmitSchemaArgs): SchemaTypes {
    return this._spellTypes(args);
  }

  /**
   * One Schema's checks at `target`, each failure pushed onto `issues`: the
   * base check, then its post-modifiers' checks once it has passed, all
   * guarded by its pre-modifiers' conditions.
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
  public static emitSchemaChecks(args: EmitChecksArgs): string {
    const continuesWhen = this._getPreModifierChecks(args);
    const baseChecked = Emitter.emitCheck(this._getBaseCheck(args));
    const postChecked = this._getPostModifierChecks(args)
      .map((check) => Emitter.emitCheck(check))
      .join('\n');

    const checks =
      postChecked === ''
        ? baseChecked
        : `${baseChecked} else {\n${Emitter.indent({ text: postChecked })}\n}`;
    return continuesWhen.length === 0
      ? checks
      : Emitter.emitBlock({ head: `if (${continuesWhen.join(' && ')})`, body: checks });
  }

  /**
   * This emitter's method mirroring the Schema method `name`, looked up on
   * this emitter and the emitters it extends, below `Emitter`. `undefined`
   * when there is none, so the method isn't compiled yet, or when `name`
   * starts with `_`.
   *
   * ```ts
   * StringSchemaEmitter.findMethod({ name: 'min' })           // StringSchemaEmitter.min
   * StringSchemaEmitter.findMethod({ name: 'optional' })      // ChainableSchemaEmitter.optional
   * StringSchemaEmitter.findMethod({ name: 'refine' })        // undefined
   * StringSchemaEmitter.findMethod({ name: '_getBaseCheck' }) // undefined
   * ```
   */
  public static findMethod({ name }: { name: string }): EmitterMethod | undefined {
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
   * The check or source text `call` compiles to, such as `.min(3)`'s check
   * or `.strict()`'s loop. Only called on a Schema
   * `Schema.findUncompilableDiagnostics` found nothing in, so the method and
   * its arguments are there. Throws when the method writes neither, which is
   * a bug in an emitter, never a user error.
   */
  public static emitCall({ call, target }: EmitCallArgs): EmittingCheckMethodOutput {
    const emitted = this.findMethod({ name: call.name })?.({ target, args: call.args ?? [] });
    if (!isEmittingCheckMethodOutput(emitted)) {
      throw new Error(`The emitter method for .${call.name}() wrote no check.`);
    }
    return emitted;
  }

  /**
   * The source text `call` compiles to: `.optional()`'s condition or
   * `.strict()`'s loop. Throws when the method writes a check instead,
   * which is a bug in an emitter, never a user error.
   */
  public static emitCallText(args: EmitCallArgs): string {
    const emitted = this.emitCall(args);
    if (typeof emitted !== 'string') {
      throw new Error(`The emitter method for .${args.call.name}() wrote no source text.`);
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
    const scope = new EmitScope();
    const { input, output } = this._emitTypes({ schema, scope });

    return [
      `// pvl.compile() on line ${String(line)}`,
      Emitter.emitBlock({
        head: `class ${className} extends PvlSchema<${input}, ${output}>`,
        body: Emitter.emitBlock({
          head: 'override _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown>',
          body: this._emitBody({ schema, scope }),
        }),
      }),
    ].join('\n');
  }

  /**
   * A check as source text: a check pushes its Issue onto `issues` when it
   * fails, and source text is already a statement.
   *
   * ```ts
   * Emitter.emitCheck({ failsWhen: 'x < 3', issue: '{ … }' }) // 'if (x < 3) {\n  issues.push({ … });\n}'
   * Emitter.emitCheck('field0 = output1;')                    // 'field0 = output1;'
   * ```
   */
  protected static emitCheck(check: EmittingCheckMethodOutput): string {
    return typeof check === 'string'
      ? check
      : Emitter.emitBlock({
          head: js`if (${check.failsWhen})`,
          body: js`issues.push(${check.issue});`,
        });
  }

  /**
   * `text` indented one level deeper, blank lines left blank.
   *
   * ```ts
   * Emitter.indent({ text: 'a;\n\nb;' }) // '  a;\n\n  b;'
   * ```
   */
  protected static indent({ text }: { text: string }): string {
    return text
      .split('\n')
      .map((line) => (line === '' ? line : `${INDENT}${line}`))
      .join('\n');
  }

  /**
   * A block: `head {`, its body one level deeper, `}`.
   *
   * ```ts
   * Emitter.emitBlock({ head: 'if (ok)', body: 'run();' }) // 'if (ok) {\n  run();\n}'
   * ```
   */
  protected static emitBlock({ head, body }: { head: string; body: string }): string {
    return `${head} {\n${Emitter.indent({ text: body })}\n}`;
  }

  /**
   * `check` returning its Issue when it fails, for the root base check that
   * leaves nothing else to check. Through `issues` rather than a literal
   * array, which TypeScript would check against Standard Schema's own Issue
   * type, which has no `code`.
   *
   * ```ts
   * Emitter.emitReturnIssueIfFails({ failsWhen: '!Array.isArray(value)', issue: '{ … }' })
   * // 'if (!Array.isArray(value)) {\n  issues.push({ … });\n  return { issues };\n}'
   * ```
   */
  protected static emitReturnIssueIfFails({
    failsWhen,
    issue,
  }: EmittingCheckMethodOutputWithCheck): string {
    return Emitter.emitBlock({
      head: js`if (${failsWhen})`,
      body: js`issues.push(${issue});` + '\nreturn { issues };',
    });
  }

  /**
   * The statement returning the Issues collected so far, if there are any.
   *
   * ```ts
   * Emitter.emitReturnIssuesIfAny() // 'if (issues.length > 0) {\n  return { issues };\n}'
   * ```
   */
  protected static emitReturnIssuesIfAny(): string {
    return Emitter.emitBlock({ head: 'if (issues.length > 0)', body: 'return { issues };' });
  }
}
