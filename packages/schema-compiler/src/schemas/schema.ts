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
import type { Node } from 'ts-morph';
import type { FollowedConsts } from '../ast/genericAst.js';
import type { PvlFactoryCall } from '../ast/types.js';
import { UnresolvedNodeException } from '../exceptions/index.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import type { EmitCompiledSchemaArgs, Emitter, SchemaEmitter } from '../emitters/emitter.js';
import { PRE_MODIFIER_NAMES } from '../consts.js';
import type { SchemaFactory } from '../enums.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import type { Module } from '../module.js';
import { RuntimeArgument } from './runtimeArgument.js';
import type { SchemaModifierCall } from './schemaTypes.js';

/** What a Schema is compiled with: its class's name, and where its `pvl.compile(...)` call is (see `EmitCompiledSchemaArgs`). */
export type CompileSchemaArgs = Omit<EmitCompiledSchemaArgs, 'schema'>;

/** What every Schema holds, whichever factory built it. */
export type SchemaOptions = {
  /** The Module it is written in. */
  module: Module;
  /** The expression it is read from. */
  expression: Node;
  /** The 1-based line its factory call is written on. */
  line: number;
  /** The Modifiers chained onto its factory call, pre- and post-modifiers together, in chain order, its `.transform()` left out. */
  calls: ReadonlyArray<SchemaModifierCall>;
  /** The `.transform()` that ends its chain, if any. */
  transformCall: SchemaModifierCall | undefined;
  /** Whether `.standalone()` is chained onto it. */
  isStandalone: boolean;
};

/** What a subclass's `readFactoryArgument` reads its factory's argument with. */
export type ReadFactoryArgs = {
  /** Reads a Schema nested in this one: a field, an element or a member. */
  readNested: (expression: Node, followed: FollowedConsts) => Schema;
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
 * const { schema } = readSchema({ module: user, expression: <pvl.compile(…)>, pvlImportLocalNames });
 * schema;                                // <ObjectSchema whose shape is [{ key: 'name', schema: <StringSchema> }]>
 * schema.findUncompilableDiagnostics(); // []: a Compilable Schema
 * schema.compile({ className: 'PvlCompiledSchema0', … }); // '(new (class PvlCompiledSchema0 implements PvlSchema<…> { … })() as PvlSchema<…>)'
 * ```
 */
export abstract class Schema {
  /** The `pvl.*` factory a subclass reads; every subclass declares its own. */
  declare public static readonly factory: SchemaFactory;

  /** The Emitter compiling a subclass, `undefined` while it can't be compiled yet. */
  public static readonly emitter: SchemaEmitter | undefined = undefined;

  /** The `pvl.*` factory that built it. */
  public readonly factory: SchemaFactory;
  /** The Module it is written in. */
  public readonly module: Module;
  /** The expression it is read from, which compiling the root replaces. */
  public readonly expression: Node;
  /** The 1-based line its factory call is written on. */
  public readonly line: number;
  /**
   * The Modifiers chained onto its factory call, pre- and post-modifiers
   * together, in chain order, its `.transform()` left out: the types a
   * Modifier sees are those the ones before it left.
   */
  public readonly calls: ReadonlyArray<SchemaModifierCall>;
  /**
   * The `.transform()` that ends its chain, if any: one returns a plain
   * Schema, which no Modifier can be chained onto, so a chain holds at most
   * one, always last. The compiler checks syntax, not types (ADR-0024), so
   * it trusts that.
   */
  public readonly transformCall: SchemaModifierCall | undefined;
  /**
   * Whether `.standalone()` is chained onto it, making it a Standalone Key
   * as an object's field: its Compiled Schema is then reachable through the
   * object's compiled `shape`, or an array's compiled `element`. It is no
   * Modifier, so it is in neither `calls` nor `transformCall`, and changes
   * no check (ADR-0036).
   */
  public readonly isStandalone: boolean;

  /** Its subclass's Emitter, `undefined` while it can't be compiled yet. */
  private readonly subclassEmitter: SchemaEmitter | undefined;

  /**
   * A Schema holding `options`, with the factory and Emitter of the
   * subclass being constructed (`new.target`).
   */
  protected constructor({
    module,
    expression,
    line,
    calls,
    transformCall,
    isStandalone,
  }: SchemaOptions) {
    this.factory = new.target.factory;
    this.subclassEmitter = new.target.emitter;
    this.module = module;
    this.expression = expression;
    this.line = line;
    this.calls = calls;
    this.transformCall = transformCall;
    this.isStandalone = isStandalone;
  }

  /** Its pre-modifiers, in chain order: they run before the type check (ADR-0010). */
  public get preModifierCalls(): ReadonlyArray<SchemaModifierCall> {
    return this.calls.filter((call) => PRE_MODIFIER_NAMES.has(call.name));
  }

  /** Its post-modifiers, in chain order, its `.transform()` left out: they run after the type check (ADR-0010). */
  public get postModifierCalls(): ReadonlyArray<SchemaModifierCall> {
    return this.calls.filter((call) => !PRE_MODIFIER_NAMES.has(call.name));
  }

  /**
   * Every method chained onto its factory call, in chain order, its
   * `.transform()` included, last: those whose arguments are read.
   *
   * ```ts
   * <pvl.string().min(3).transform(trim)>.chainedCalls // [min(3), transform(<Runtime Argument trim>)]
   * ```
   */
  public get chainedCalls(): ReadonlyArray<SchemaModifierCall> {
    const { calls, transformCall } = this;
    return transformCall === undefined ? calls : [...calls, transformCall];
  }

  /**
   * The Modifiers chained before `call`, in chain order, which left the
   * types it sees; every one of them when `call` is omitted, or is the
   * `.transform()`, which is chained after them all. Throws for a call
   * chained onto another Schema, which is a bug in the compiler, never a
   * user error.
   *
   * ```ts
   * <pvl.string().refine(isOk).optional()>.findCallsBefore(<.refine(isOk)>) // []
   * <pvl.string().refine(isOk).optional()>.findCallsBefore(undefined)       // [refine(<Runtime Argument isOk>), optional()]
   * ```
   */
  public findCallsBefore(call: SchemaModifierCall | undefined): ReadonlyArray<SchemaModifierCall> {
    const { calls } = this;
    if (call === undefined || call === this.transformCall) {
      return calls;
    }
    const callIndex = calls.indexOf(call);
    if (callIndex === -1) {
      throw new Error(
        `.${call.name}() on line ${String(call.line)} isn't chained onto this Schema.`,
      );
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
    const { subclassEmitter } = this;
    if (subclassEmitter === undefined) {
      return [
        new Diagnostic({
          code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
          message: `The \`pvl.${this.factory}()\` on line ${String(this.line)} can't be compiled yet.`,
          file: this.module.path.absolutePath,
        }),
      ];
    }
    return [
      ...this.chainedCalls.flatMap(
        (call) => this.findUncompilableCallDiagnostic(subclassEmitter, call) ?? [],
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
    return this.emitter.emitCompiledSchema({ ...compileSchemaArgs, schema: this });
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
   * Schema nested in it, at any depth, its own first.
   *
   * ```ts
   * <pvl.object({ name: pvl.string().max(max) }).strict(options)>.findRuntimeArguments() // [<options>, <max>]
   * <pvl.string().max(3)>.findRuntimeArguments()                                       // []
   * ```
   */
  public findRuntimeArguments(): ReadonlyArray<RuntimeArgument> {
    return [
      ...this.chainedCalls.flatMap((call) =>
        (call.args ?? []).filter((argument) => argument instanceof RuntimeArgument),
      ),
      ...this.findChildren().flatMap((child) => child.findRuntimeArguments()),
    ];
  }

  /**
   * The argument of `link`, the factory call, which every factory but the
   * primitives needs. Throws an UnresolvedNodeException at the call when there
   * is none.
   *
   * ```ts
   * Schema.readArgument(<pvl.array(pvl.string())>) // <pvl.string()>
   * Schema.readArgument(<pvl.array()>)             // throws
   * ```
   */
  protected static readArgument({ call }: PvlFactoryCall): Node {
    const [argument] = call.getArguments();
    if (argument === undefined) {
      throw new UnresolvedNodeException(call);
    }
    return argument;
  }

  /**
   * The diagnostic for a method chained onto it, if it can't be compiled:
   * `emitter` has no method for it, or one of its arguments is spread.
   *
   * ```ts
   * .min(3) on a string                  // undefined
   * .min(MIN_FROM_IMPORT) on a string    // undefined: a Runtime Argument
   * .optional() on the root object       // undefined
   * .refine(isOk) on a string            // undefined: a Runtime Argument
   * .strict() on a string                // UNSUPPORTED_SCHEMA: an object's method
   * .min(...limits) on a string          // COMPILE_ARGUMENT_UNRESOLVABLE
   * ```
   */
  private findUncompilableCallDiagnostic(
    emitter: typeof Emitter,
    call: SchemaModifierCall,
  ): Diagnostic | undefined {
    if (!emitter.compilesMethod({ name: call.name })) {
      return new Diagnostic({
        code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
        message: `\`.${call.name}()\` on line ${String(call.line)} can't be compiled yet.`,
        file: this.module.path.absolutePath,
      });
    }
    return call.args === undefined
      ? new Diagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
          message: `An argument of \`.${call.name}()\` on line ${String(call.line)} is spread, so it has no fixed position for the Compiled Schema to pass it at.`,
          file: this.module.path.absolutePath,
        })
      : undefined;
  }
}
