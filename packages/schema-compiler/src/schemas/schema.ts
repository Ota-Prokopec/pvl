// The abstract base of a Schema as the compiler knows it: one Schema written
// in a Module, read from source statically (ADR-0002), and compiled into its
// Compiled Schema. Only a `pvl.*` call chain, a literal or a top-level `const`
// of the same file holding one is understood; a method's argument that isn't
// one is a Runtime Argument, which the Compiled Schema evaluates (ADR-0030).
// Nothing is imported or executed. Each factory reads into its own subclass in `src/schemas/`, which
// names its Emitter (ADR-0026) and registers itself here as its module loads,
// so this module never imports one: a subclass extends `Schema` as its
// module loads, so an import back would run it before `Schema` exists.
import type { Node } from 'ts-morph';
import { ConstCycleError } from '../ast/constCycleError.js';
import { GenericAst, type FollowedConsts } from '../ast/genericAst.js';
import { PvlAst, type CallChainLink } from '../ast/pvlAst.js';
import { UnresolvedNodeError } from '../ast/unresolvedNodeError.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import type { EmitCompiledSchemaArgs, Emitter } from '../emitters/emitter.js';
import { PRE_MODIFIER_NAMES } from '../consts.js';
import { DIAGNOSTIC_CODE, SCHEMA_FACTORY, type SchemaFactory } from '../enums.js';
import type { Module } from '../module.js';
import { RuntimeArgument } from './runtimeArgument.js';
import type { SchemaModifierCall, SchemaModifierCallArgument } from './schemaTypes.js';

/** The expression a Schema is read from, and the Module it is written in. */
export type ReadSchemaArgs = {
  module: Module;
  /** A `pvl.*` call chain, a `const` holding one, or a `pvl.compile(...)` call, which is read through. */
  expression: Node;
  /** The Local Names `pvl` is imported under from `@pvl/schema`. */
  pvlImportLocalNames: ReadonlySet<string>;
};

/** What a Schema is read with: what it was asked to read, and the Runtime Arguments its `pvl.compile(...)` call reaches so far, in the order they are read. */
type ReadingArgs = ReadSchemaArgs & {
  readonly runtimeArguments: RuntimeArgument[];
};

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
  /** The pre-modifiers chained onto its factory call, in chain order. */
  preModifierCalls: ReadonlyArray<SchemaModifierCall>;
  /** The post-modifiers chained onto its factory call, in chain order. */
  postModifierCalls: ReadonlyArray<SchemaModifierCall>;
};

/** What a subclass's `fromFactory` reads its factory call with. */
export type ReadFactoryArgs = ReadSchemaArgs & {
  /**
   * Reads every method chained onto the factory call, in chain order.
   * Called once the factory's argument is read, as it is read first.
   */
  readCalls: () => ReadonlyArray<SchemaModifierCall>;
  /** Reads a Schema nested in this one: a field, an element or a member. */
  readNested: (expression: Node, followed: FollowedConsts) => Schema;
};

/** A Schema subclass, as `Schema.read` picks one by the factory it reads. */
export type SchemaClass = {
  /** The `pvl.*` factory it reads. */
  readonly factory: SchemaFactory;
  /** The Emitter compiling it, `undefined` while it can't be compiled yet. */
  readonly emitter: typeof Emitter | undefined;
  /** The Schema a `pvl.<factory>(…)` call holds, reading its argument. */
  fromFactory: (link: CallChainLink, args: ReadFactoryArgs) => Schema;
};

const SCHEMA_FACTORIES: ReadonlySet<string> = new Set(Object.values(SCHEMA_FACTORY));

/**
 * One Schema written in a Module, which holds any number of them, as the
 * subclass of the factory that built it. Its `compile` compiles it whether
 * it is marked to compile or not; which Schemas get compiled is the
 * caller's choice (see `Module.findMarkedToCompileSchemas`). A Schema nested
 * in it is a Schema of its own, in the same Module, read from its own
 * expression; only the root is ever compiled and replaced.
 *
 * ```ts
 * // /repo/src/schemas/user.ts
 * // export const user = pvl.compile(pvl.object({ name: pvl.string() }));
 * const { schema } = Schema.read({ module: user, expression: <pvl.compile(…)>, pvlImportLocalNames });
 * schema;                                // <ObjectSchema whose shape is [{ key: 'name', schema: <StringSchema> }]>
 * schema.findUncompilableDiagnostics(); // []: a Compilable Schema
 * schema.compile({ className: 'PvlCompiledSchema0', … }); // '(new (class PvlCompiledSchema0 implements PvlSchema<…> { … })() as PvlSchema<…>)'
 * ```
 */
export abstract class Schema {
  /** The `pvl.*` factory a subclass reads; every subclass declares its own. */
  declare public static readonly factory: SchemaFactory;

  /** The Emitter compiling a subclass, `undefined` while it can't be compiled yet. */
  public static readonly emitter: typeof Emitter | undefined = undefined;

  // Every subclass, by the factory it reads, as each registers itself.
  private static readonly classByFactory = new Map<string, SchemaClass>();

  /** The `pvl.*` factory that built it. */
  public readonly factory: SchemaFactory;
  /** The Module it is written in. */
  public readonly module: Module;
  /** The expression it is read from, which compiling the root replaces. */
  public readonly expression: Node;
  /** The 1-based line its factory call is written on. */
  public readonly line: number;
  /** The pre-modifiers chained onto its factory call, in chain order: they run before the type check (ADR-0010). */
  public readonly preModifierCalls: ReadonlyArray<SchemaModifierCall>;
  /** The post-modifiers chained onto its factory call, in chain order: they run after the type check (ADR-0010). */
  public readonly postModifierCalls: ReadonlyArray<SchemaModifierCall>;

  /** Its subclass's Emitter, `undefined` while it can't be compiled yet. */
  private readonly subclassEmitter: typeof Emitter | undefined;

  /**
   * A Schema holding `options`, with the factory and Emitter of the
   * subclass being constructed (`new.target`).
   */
  protected constructor({
    module,
    expression,
    line,
    preModifierCalls,
    postModifierCalls,
  }: SchemaOptions) {
    this.factory = new.target.factory;
    this.subclassEmitter = new.target.emitter;
    this.module = module;
    this.expression = expression;
    this.line = line;
    this.preModifierCalls = preModifierCalls;
    this.postModifierCalls = postModifierCalls;
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
  public get emitter(): typeof Emitter {
    const { subclassEmitter } = this;
    if (subclassEmitter === undefined) {
      throw new Error(`A pvl.${this.factory}() has no emitter.`);
    }
    return subclassEmitter;
  }

  /**
   * The Schema `expression` holds, as the subclass of its factory, or an
   * error on its Module's file: COMPILE_ARGUMENT_UNRESOLVABLE naming the
   * first node that can't be read statically, or COMPILE_ARGUMENT_CYCLE
   * naming a `const` that reaches itself.
   *
   * ```ts
   * // const MIN = 3;
   * // export const user = pvl.compile(pvl.object({ name: pvl.string().min(MIN) }));
   * Schema.read({ expression: <pvl.compile(…)>, … })
   * // { schema: <ObjectSchema whose shape is [{ key: 'name', schema: <StringSchema with postModifierCalls [min(3)]> }]> }
   * Schema.read({ expression: <pvl.object({ name: pvl.string() })>, … }) // { schema: <ObjectSchema> }: not marked, still read
   * // export const getName = (max: number) => pvl.compile(pvl.string().max(max));
   * Schema.read({ expression: <pvl.compile(…)>, … }) // { schema: <StringSchema with postModifierCalls [max(<Runtime Argument max>)]> }
   * // export const home = pvl.compile(importedAddress);
   * Schema.read({ expression: <pvl.compile(importedAddress)>, … }) // { diagnostic: COMPILE_ARGUMENT_UNRESOLVABLE }
   * // const user = pvl.object({ friend: user });
   * Schema.read({ expression: <pvl.compile(user)>, … })            // { diagnostic: COMPILE_ARGUMENT_CYCLE }
   * ```
   */
  public static read(args: ReadSchemaArgs): { schema: Schema } | { diagnostic: Diagnostic } {
    try {
      return { schema: Schema.readExpression({ ...args, runtimeArguments: [] }) };
    } catch (error) {
      if (error instanceof ConstCycleError) {
        const { cycleNode } = error;
        return {
          diagnostic: new Diagnostic({
            code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_CYCLE,
            message: `The Schema on line ${String(args.expression.getStartLineNumber())} can't be read statically: the const \`${cycleNode.getText()}\` refers back to itself on line ${String(cycleNode.getStartLineNumber())}, so reading it would never end.`,
            file: args.module.path.absolutePath,
          }),
        };
      }
      if (!(error instanceof UnresolvedNodeError)) {
        throw error;
      }
      const { unresolvedNode } = error;
      return {
        diagnostic: new Diagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
          message: `The Schema on line ${String(args.expression.getStartLineNumber())} can't be read statically: \`${unresolvedNode.getText()}\` on line ${String(unresolvedNode.getStartLineNumber())} isn't a pvl Schema, a literal or a const of this file holding one.`,
          file: args.module.path.absolutePath,
        }),
      };
    }
  }

  /**
   * Its diagnostics, and those of every Schema nested in it at any depth,
   * one per problem, each on its Module's file; none means it is a
   * Compilable Schema, at the root or nested alike:
   *
   * - UNSUPPORTED_SCHEMA: a Schema with no Emitter (a union), or a method
   *   its Emitter can't compile yet (`.coerce()`, `.refine()`,
   *   `.transform()`).
   * - COMPILE_ARGUMENT_UNRESOLVABLE: a compiled method's argument is spread,
   *   so it has no fixed position; any other argument it can't read is a
   *   Runtime Argument.
   *
   * ```ts
   * <pvl.compile(pvl.object({ name: pvl.string().min(3) }))>.findUncompilableDiagnostics() // []
   * <pvl.compile(pvl.string().max(2).optional())>.findUncompilableDiagnostics()            // []
   * <pvl.compile(pvl.object({ ids: pvl.array(pvl.union([…])) }))>.findUncompilableDiagnostics() // [UNSUPPORTED_SCHEMA]
   * <pvl.compile(pvl.array(pvl.number().refine((n) => n > 0)))>.findUncompilableDiagnostics()  // [UNSUPPORTED_SCHEMA]
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
      ...[...this.preModifierCalls, ...this.postModifierCalls].flatMap(
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
      ...[...this.preModifierCalls, ...this.postModifierCalls].flatMap((call) =>
        (call.args ?? []).filter((argument) => argument instanceof RuntimeArgument),
      ),
      ...this.findChildren().flatMap((child) => child.findRuntimeArguments()),
    ];
  }

  /**
   * Registers `schemaClass` as the subclass reading its factory. Every
   * subclass calls it once, from its static block.
   */
  protected static registerClass(schemaClass: SchemaClass): void {
    Schema.classByFactory.set(schemaClass.factory, schemaClass);
  }

  /**
   * What every Schema holds, read off `link`, the factory call, and
   * `args`: a subclass's `fromFactory` passes it on to its constructor,
   * once it has read the factory's argument, which is read before the
   * methods chained onto the call. Those are split into the pre-modifiers
   * and the post-modifiers, each kept in chain order, as `@pvl/schema` adds
   * them to its two arrays.
   *
   * ```ts
   * Schema.readOptions(<pvl.string().min(3).optional()>, args)
   * // { …, preModifierCalls: [optional()], postModifierCalls: [min(3)] }
   * ```
   */
  protected static readOptions(link: CallChainLink, args: ReadFactoryArgs): SchemaOptions {
    const { module, expression } = args;
    const calls = args.readCalls();
    return {
      module,
      expression,
      line: link.call.getStartLineNumber(),
      preModifierCalls: calls.filter((call) => PRE_MODIFIER_NAMES.has(call.name)),
      postModifierCalls: calls.filter((call) => !PRE_MODIFIER_NAMES.has(call.name)),
    };
  }

  /**
   * The argument of `link`, the factory call, which every factory but the
   * primitives needs. Throws an UnresolvedNodeError at the call when there
   * is none.
   *
   * ```ts
   * Schema.readArgument(<pvl.array(pvl.string())>) // <pvl.string()>
   * Schema.readArgument(<pvl.array()>)             // throws
   * ```
   */
  protected static readArgument({ call }: CallChainLink): Node {
    const [argument] = call.getArguments();
    if (argument === undefined) {
      throw new UnresolvedNodeError(call);
    }
    return argument;
  }

  /**
   * The Schema `expression` holds: a `pvl.<factory>(…)` call with methods
   * chained onto it, following `const`s (see `PvlAst.readCallChain`), read
   * by the subclass of its factory. `pvl.compile(…)` is read through to its
   * argument, which keeps `expression` as its own and reads the methods
   * chained onto the call after its own. Throws an UnresolvedNodeError at
   * the first node that can't be read, or a ConstCycleError at a `const`
   * that reaches itself.
   *
   * ```ts
   * Schema.readExpression({ expression: <pvl.string().min(3)>, … })       // <StringSchema with postModifierCalls [min(3)]>
   * Schema.readExpression({ expression: <pvl.string().refine(isOk)>, … }) // <StringSchema with postModifierCalls [refine(<Runtime Argument isOk>)]>
   * Schema.readExpression({ expression: <user>, … })                      // what `const user = …` holds
   * Schema.readExpression({ expression: <pvl.compile(pvl.string())>, … }) // <StringSchema> read from <pvl.compile(…)>
   * Schema.readExpression({ expression: <makeSchema()>, … })              // throws
   * ```
   */
  private static readExpression(
    args: ReadingArgs,
    expression: Node = args.expression,
    followed?: FollowedConsts,
    readOuterCalls: () => ReadonlyArray<SchemaModifierCall> = () => [],
  ): Schema {
    const { factory, methods } = PvlAst.readCallChain(
      expression,
      args.pvlImportLocalNames,
      followed,
    );
    const readCalls = Schema.createCallsReader(methods, readOuterCalls, args.runtimeArguments);
    const [argument] = factory.call.getArguments();
    if (factory.methodName === 'compile' && argument !== undefined) {
      return Schema.readExpression(args, argument, factory.followed, readCalls);
    }
    return Schema.findClassOfFactory(factory).fromFactory(factory, {
      ...args,
      readCalls,
      readNested: (nestedExpression, nestedFollowed) =>
        Schema.readExpression(
          { ...args, expression: nestedExpression },
          nestedExpression,
          nestedFollowed,
        ),
    });
  }

  /**
   * Reads `methods` as calls, then what `readOuterCalls` reads after them:
   * the methods chained onto a `pvl.compile(…)` the Schema is read through.
   * Each Runtime Argument read is added to `runtimeArguments`.
   *
   * ```ts
   * Schema.createCallsReader([<.min(3)>], () => [], [])()   // [{ name: 'min', args: [3], line: 1 }]
   * Schema.createCallsReader([<.min(min)>], () => [], [])() // [{ name: 'min', args: [<Runtime Argument min>], line: 1 }]
   * ```
   */
  private static createCallsReader(
    methods: ReadonlyArray<CallChainLink>,
    readOuterCalls: () => ReadonlyArray<SchemaModifierCall>,
    runtimeArguments: RuntimeArgument[],
  ): () => ReadonlyArray<SchemaModifierCall> {
    return () => [
      ...methods.map(({ call, methodName, followed }) => ({
        name: methodName,
        args: Schema.readCallArguments(call.getArguments(), followed, runtimeArguments),
        line: call.getStartLineNumber(),
      })),
      ...readOuterCalls(),
    ];
  }

  /**
   * The subclass reading the factory `link` calls. Throws an
   * UnresolvedNodeError at the call when it is no `pvl.*` factory, and an
   * Error when no subclass registered for it, which is a bug in the
   * compiler, never a user error.
   */
  private static findClassOfFactory(link: CallChainLink): SchemaClass {
    if (!SCHEMA_FACTORIES.has(link.methodName)) {
      throw new UnresolvedNodeError(link.call);
    }
    const schemaClass = Schema.classByFactory.get(link.methodName);
    if (schemaClass === undefined) {
      throw new Error(
        `No Schema subclass reads pvl.${link.methodName}(): load src/schemas/ before reading a Schema.`,
      );
    }
    return schemaClass;
  }

  /**
   * A method's arguments, each read statically as written, or else a
   * Runtime Argument, numbered on from the ones `runtimeArguments` holds,
   * which it is added to. `undefined` when one is spread (`...limits`, or
   * `{ ...options }` written in place), as it has no fixed position. A
   * `const` that reaches itself is still thrown: it is no value at all.
   *
   * ```ts
   * Schema.readCallArguments([<3>, <{ message: 'short' }>], followed, []) // [3, { message: 'short' }]
   * Schema.readCallArguments([<MIN>], followed, [])                       // [3], with `const MIN = 3`
   * Schema.readCallArguments([<min>, <options>], followed, [])            // [<Runtime Argument min>, <Runtime Argument options>], with parameters `min` and `options`
   * Schema.readCallArguments([<...limits>], followed, [])                 // undefined
   * ```
   */
  private static readCallArguments(
    args: ReadonlyArray<Node>,
    followed: FollowedConsts,
    runtimeArguments: RuntimeArgument[],
  ): SchemaModifierCallArgument[] | undefined {
    if (args.some((argument) => GenericAst.isSpread(argument))) {
      return undefined;
    }
    return args.map((argument) => {
      try {
        return GenericAst.readStaticValue(argument, followed);
      } catch (error) {
        if (!(error instanceof UnresolvedNodeError)) {
          throw error;
        }
        const runtimeArgument = new RuntimeArgument(argument, runtimeArguments.length);
        runtimeArguments.push(runtimeArgument);
        return runtimeArgument;
      }
    });
  }

  /**
   * The diagnostic for a method chained onto it, if it can't be compiled:
   * `emitter` has no method for it, or one of its arguments is spread.
   *
   * ```ts
   * .min(3) on a string                  // undefined
   * .min(MIN_FROM_IMPORT) on a string    // undefined: a Runtime Argument
   * .optional() on the root object       // undefined
   * .refine(isOk) on a string            // UNSUPPORTED_SCHEMA
   * .min(...limits) on a string          // COMPILE_ARGUMENT_UNRESOLVABLE
   * ```
   */
  private findUncompilableCallDiagnostic(
    emitter: typeof Emitter,
    call: SchemaModifierCall,
  ): Diagnostic | undefined {
    if (emitter.findEmittingMethod({ name: call.name }) === undefined) {
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
