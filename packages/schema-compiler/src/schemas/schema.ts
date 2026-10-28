// The abstract base of a Schema as the compiler knows it: one Schema written
// in a Module, read from source statically (ADR-0002), and compiled into its
// Compiled Schema. Only a `pvl.*` call chain, a literal or a top-level `const`
// of the same file holding one is understood; a method's argument that isn't
// one is a Runtime Argument, which the Compiled Schema evaluates (ADR-0030).
// Nothing is imported or executed. Each factory reads into its own subclass in
// `src/schemas/`, which names its Emitter (ADR-0026). `readSchema.ts` picks
// the subclass and imports every one, so this module imports none: a subclass
// extends `Schema` as its module loads, so an import back would run it before
// `Schema` exists (ADR-0034).
import {
  PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM,
  PVL_SCHEMA_PRE_MODIFIER_METHOD_NAMES,
  type PvlFactoryName,
} from '@pvl/schema';
import type { Node } from 'ts-morph';
import type { Diagnostic } from '../diagnostics/diagnostic.js';
import type { EmitCompiledSchemaArgs } from '../emitters/types/compiledSchema.js';
import type { SchemaEmitter } from '../emitters/schemaEmitter.js';
import type { Module } from '../module/module.js';
import { RuntimeArgument } from '../runtimeArgument/runtimeArgument.js';
import type { ChainedRuntimeArgument } from '../runtimeArgument/types.js';
import { readFunctionArgument } from '../runtimeArgument/utils.js';
import type { SchemaModifierCall } from './types/modifierCall.js';
import type { SchemaOptions } from './types/schemaOptions.js';
import { createUnsupportedSchemaDiagnostic, findUncompilableCallDiagnostic } from './utils.js';

/** What a Schema is compiled with: its class's name, and where its `pvl.compile(...)` call is (see `EmitCompiledSchemaArgs`), always at the root. */
export type CompileSchemaArgs = Omit<
  EmitCompiledSchemaArgs,
  'schema' | 'hoistedNameByExpression'
> & {
  hoistedNameByExpression: NonNullable<EmitCompiledSchemaArgs['hoistedNameByExpression']>;
};

/**
 * One Schema written in a Module, which holds any number of them, as the
 * subclass of the factory that built it. Its `compile` compiles it whether
 * it is marked to compile or not; which Schemas get compiled is the
 * caller's choice (see `findMarkedToCompileSchemas`). A Schema nested
 * in it is a Schema of its own, in the same Module, read from its own
 * expression; only the root is ever compiled and replaced.
 *
 * ```ts
 * // /repo/src/schemas/user.ts
 * // export const user = pvl.compile(pvl.object({ name: pvl.string() }));
 * const { schema } = readSchema({ module: user, expression: <pvl.compile(…)> });
 * schema;                                // <ObjectSchema whose shape is [{ key: 'name', schema: <StringSchema> }]>
 * schema.findUncompilableDiagnostics(); // []: a Compilable Schema
 * schema.compile({ className: 'PvlCompiledSchema0', … }); // '(new (class PvlCompiledSchema0 implements PvlSchema<…> { … })() as PvlSchema<…>)'
 * ```
 */
export abstract class Schema {
  /** The `pvl.*` factory a subclass reads; every subclass declares its own. */
  declare public static readonly factory: PvlFactoryName;

  /** The Emitter compiling a subclass, `undefined` while it can't be compiled yet. */
  public static readonly emitter: SchemaEmitter | undefined = undefined;

  /** The `pvl.*` factory that built it. */
  public readonly factory: PvlFactoryName;
  /** The Module it is written in. */
  public readonly module: Module;
  /** The expression it is read from, which compiling the root replaces. */
  public readonly expression: Node;
  /**
   * Where its factory call is written, as a diagnostic on its Module names
   * it (`Module.spellLocation`): `line 3`, or `line 2 of ../shared/user.ts`
   * in another file (ADR-0043). Spelled when it is read, so it holds no node
   * that compiling another Module would leave stale.
   */
  public readonly location: string;
  /**
   * The Modifiers chained onto its factory call, pre- and post-modifiers
   * together, in chain order: the types a Modifier sees are those the ones
   * before it left. Its `.transform()`, if any, is last: one returns a plain
   * Schema, which no Modifier can be chained onto, so a chain holds at most
   * one. The compiler checks syntax, not types (ADR-0024), so it trusts
   * that.
   */
  public readonly calls: ReadonlyArray<SchemaModifierCall>;
  /**
   * Whether `.standalone()` is chained onto it, making it a Standalone Key
   * as an object's field: its Compiled Schema is then reachable through the
   * object's compiled `shape`, or an array's compiled `element`. It is no
   * Modifier, so it isn't in `calls`, and changes
   * no check (ADR-0036).
   */
  public readonly isStandalone: boolean;

  /** Its subclass's Emitter, `undefined` while it can't be compiled yet. */
  private readonly subclassEmitter: SchemaEmitter | undefined;

  /**
   * A Schema holding `options`, with the factory and Emitter of the
   * subclass being constructed (`new.target`).
   */
  protected constructor({ module, expression, location, calls, isStandalone }: SchemaOptions) {
    this.factory = new.target.factory;
    this.subclassEmitter = new.target.emitter;
    this.module = module;
    this.expression = expression;
    this.location = location;
    this.calls = calls;
    this.isStandalone = isStandalone;
  }

  /** Its pre-modifiers, in chain order: they run before the type check (ADR-0010). */
  public get preModifierCalls(): ReadonlyArray<SchemaModifierCall> {
    return this.calls.filter((call) => PVL_SCHEMA_PRE_MODIFIER_METHOD_NAMES.has(call.name));
  }

  /** Its post-modifiers, in chain order, its `.transform()` included, last: they run after the type check (ADR-0010). */
  public get postModifierCalls(): ReadonlyArray<SchemaModifierCall> {
    return this.calls.filter((call) => !PVL_SCHEMA_PRE_MODIFIER_METHOD_NAMES.has(call.name));
  }

  /**
   * The function its `.transform()` is passed, the Runtime Argument it
   * always is; `undefined` without one. Read lazily, as a spread one is
   * reported by `findUncompilableDiagnostics` before anything reads it.
   *
   * ```ts
   * <pvl.string().transform(trim)>.getTransformFunction() // <Runtime Argument trim>
   * <pvl.string()>.getTransformFunction()                 // undefined
   * ```
   */
  public getTransformFunction(): RuntimeArgument | undefined {
    const transformCall = this.calls.find(
      (call) => call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.TRANSFORM,
    );
    return transformCall === undefined ? undefined : readFunctionArgument(transformCall.args?.[0]);
  }

  /**
   * The Modifiers chained before `call`, in chain order, which left the
   * types it sees; every one of them, its `.transform()` included, when
   * `call` is omitted. Throws for a call chained onto another Schema, which
   * is a bug in the compiler, never a user error.
   *
   * ```ts
   * <pvl.string().refine(isOk).optional()>.findCallsBefore(<.refine(isOk)>) // []
   * <pvl.string().refine(isOk).optional()>.findCallsBefore(undefined)       // [refine(<Runtime Argument isOk>), optional()]
   * ```
   */
  public findCallsBefore(call: SchemaModifierCall | undefined): ReadonlyArray<SchemaModifierCall> {
    const { calls } = this;
    if (call === undefined) {
      return calls;
    }
    const callIndex = calls.indexOf(call);
    if (callIndex === -1) {
      throw new Error(`.${call.name}() on ${call.location} isn't chained onto this Schema.`);
    }
    return calls.slice(0, callIndex);
  }

  /**
   * The Emitter compiling it. Only read of a Schema
   * `findUncompilableDiagnostics` found nothing in; throws for one that
   * can't be compiled yet, which is a bug in the compiler, never a user
   * error.
   *
   * ```ts
   * <pvl.string()>.emitter               // StringSchemaEmitter
   * <pvl.union([pvl.string()])>.emitter  // throws
   * ```
   */
  public get emitter(): SchemaEmitter {
    const { subclassEmitter } = this;
    if (subclassEmitter === undefined) {
      throw new Error(`A pvl.${this.factory}() has no emitter.`);
    }
    return subclassEmitter;
  }

  /**
   * Its diagnostics, and those of every Schema nested in it at any depth,
   * one per problem, each on its Module's file; none means it is a
   * Compilable Schema, at the root or nested alike:
   *
   * - UNSUPPORTED_SCHEMA: a Schema with no Emitter (a union), or a method
   *   its Emitter can't compile, as when the source chains another Schema's
   *   onto it (`pvl.string().strict()`). A method `@pvl/schema` doesn't have
   *   at all is reported while the Schema is read, which stops there
   *   (ADR-0038).
   * - COMPILE_ARGUMENT_UNRESOLVABLE: a compiled method's argument is spread,
   *   so it has no fixed position; any other argument it can't read is a
   *   Runtime Argument.
   *
   * ```ts
   * <pvl.compile(pvl.object({ name: pvl.string().min(3) }))>.findUncompilableDiagnostics() // []
   * <pvl.compile(pvl.string().max(2).optional())>.findUncompilableDiagnostics()            // []
   * <pvl.compile(pvl.object({ ids: pvl.array(pvl.union([…])) }))>.findUncompilableDiagnostics() // [UNSUPPORTED_SCHEMA]
   * <pvl.compile(pvl.array(pvl.number().refine((n) => n > 0)))>.findUncompilableDiagnostics()  // []
   * ```
   */
  public findUncompilableDiagnostics(): Diagnostic[] {
    const { subclassEmitter, factory, location } = this;
    const file = this.module.path.absolutePath;
    if (subclassEmitter === undefined) {
      return [createUnsupportedSchemaDiagnostic({ factory, location, file })];
    }
    return [
      ...this.calls.flatMap(
        (call) => findUncompilableCallDiagnostic({ emitter: subclassEmitter, call, file }) ?? [],
      ),
      ...this.findChildren().flatMap((child) => child.findUncompilableDiagnostics()),
    ];
  }

  /**
   * Its Compiled Schema: the expression that replaces its own, an instance
   * of a class expression named `className`, written by its Emitter (see
   * `Emitter.emitCompiledSchema`), which is passed its Runtime Arguments.
   * Compiles any Schema, marked to compile or not, so long as
   * `findUncompilableDiagnostics` found nothing.
   *
   * ```ts
   * <pvl.compile(pvl.object({ name: pvl.string().max(max) }))>.compile({ className: 'PvlCompiledSchema0', indentation: '', hoistedNameByExpression: new Map() })
   * // (new (class PvlCompiledSchema0 implements PvlSchema<{ name: string }, { name: string }> { … })(max) as PvlSchema<{ name: string }, { name: string }>)
   * ```
   */
  public compile(compileSchemaArgs: CompileSchemaArgs): string {
    return this.emitter.emitCompiledSchema({ ...compileSchemaArgs, schema: this }).expression;
  }

  /**
   * The Schemas nested directly in it: an object's fields', an array's
   * element's, a union's members'. None for any other.
   *
   * ```ts
   * <pvl.object({ a: pvl.string(), b: pvl.number() })>.findChildren() // [<pvl.string()>, <pvl.number()>]
   * <pvl.string()>.findChildren()                                       // []
   * ```
   */
  public findChildren(): ReadonlyArray<Schema> {
    return [];
  }

  /**
   * The Runtime Arguments of the methods chained onto it and onto every
   * Schema nested in it, at any depth, its own first, each with the Schema
   * (`owner`) and the call it is passed to and its position among the
   * call's arguments.
   *
   * ```ts
   * <pvl.object({ name: pvl.string().max(max) }).strict(options)>.findChainedRuntimeArguments()
   * // [{ argument: <options>, owner: <pvl.object(…)>, call: <.strict(options)>, position: 0 }, { argument: <max>, owner: <pvl.string().max(max)>, call: <.max(max)>, position: 0 }]
   * <pvl.string().max(3)>.findChainedRuntimeArguments() // []
   * ```
   */
  public findChainedRuntimeArguments(): ReadonlyArray<ChainedRuntimeArgument> {
    return [
      ...this.calls.flatMap((call) =>
        (call.args ?? []).flatMap((argument, position) =>
          argument instanceof RuntimeArgument ? [{ argument, owner: this, call, position }] : [],
        ),
      ),
      ...this.findChildren().flatMap((child) => child.findChainedRuntimeArguments()),
    ];
  }
}
