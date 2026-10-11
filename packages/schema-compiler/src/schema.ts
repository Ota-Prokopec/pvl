// A Schema as the compiler knows it: one Schema written in a Module, read
// from source statically (ADR-0002), and compiled into its Compiled Schema. Only a `pvl.*` call chain, a literal or a top-level `const` of the
// same file holding one is understood. Nothing is imported or executed.
import type { EnumMember, PossibleLiteralValue } from '@pvl/schema';
import type { Node } from 'ts-morph';
import { ConstCycleError } from './ast/constCycleError.js';
import { GenericAst, type FollowedConsts, type StaticValue } from './ast/genericAst.js';
import { PvlAst, type CallChainLink } from './ast/pvlAst.js';
import { UnresolvedNodeError } from './ast/unresolvedNodeError.js';
import { COMPOSITE_FACTORIES } from './consts.js';
import { Diagnostic } from './diagnostics/diagnostic.js';
import { ArraySchemaEmitter } from './emitters/arraySchemaEmitter.js';
import { BigintSchemaEmitter } from './emitters/bigintSchemaEmitter.js';
import { BooleanSchemaEmitter } from './emitters/booleanSchemaEmitter.js';
import { ChainableSchemaEmitter } from './emitters/chainableSchemaEmitter.js';
import type { FindEmitter } from './emitters/emitScope.js';
import type { Emitter } from './emitters/emitter.js';
import { EnumSchemaEmitter } from './emitters/enumSchemaEmitter.js';
import { LiteralSchemaEmitter } from './emitters/literalSchemaEmitter.js';
import { NumberSchemaEmitter } from './emitters/numberSchemaEmitter.js';
import { ObjectSchemaEmitter } from './emitters/objectSchemaEmitter.js';
import { StringSchemaEmitter } from './emitters/stringSchemaEmitter.js';
import { DIAGNOSTIC_CODE, SCHEMA_FACTORY, type SchemaFactory } from './enums.js';
import type { Module } from './module.js';

/** One method chained onto a Schema: `.min(3, { message: 'too short' })`. */
export type SchemaMethodCall = {
  name: string;
  /** `undefined` when an argument isn't a literal, such as `.refine()`'s function. */
  args: ReadonlyArray<StaticValue> | undefined;
  /** The 1-based line it is written on. */
  line: number;
};

/** One field of an object Schema. */
export type ObjectField = {
  key: string;
  schema: SchemaModel;
};

/**
 * A Schema as read from source: the factory that built it, that factory's
 * arguments, and every method chained onto it, in chain order.
 *
 * ```ts
 * pvl.object({ name: pvl.string().min(3) }).strict()
 * // { factory: 'object', calls: [{ name: 'strict', args: [] }],
 * //   shape: [{ key: 'name', schema: { factory: 'string', calls: [{ name: 'min', args: [3] }] } }] }
 * ```
 */
export type SchemaModel = {
  /** Every method chained onto the factory call, in chain order. */
  calls: ReadonlyArray<SchemaMethodCall>;
  /** The 1-based line the factory call is written on. */
  line: number;
} & (
  | {
      factory:
        | typeof SCHEMA_FACTORY.STRING
        | typeof SCHEMA_FACTORY.NUMBER
        | typeof SCHEMA_FACTORY.BOOLEAN
        | typeof SCHEMA_FACTORY.BIGINT;
    }
  | { factory: typeof SCHEMA_FACTORY.LITERAL; literalValue: PossibleLiteralValue }
  | { factory: typeof SCHEMA_FACTORY.ENUM; members: ReadonlyArray<EnumMember> }
  | { factory: typeof SCHEMA_FACTORY.OBJECT; shape: ReadonlyArray<ObjectField> }
  | { factory: typeof SCHEMA_FACTORY.ARRAY; element: SchemaModel }
  | { factory: typeof SCHEMA_FACTORY.UNION; members: ReadonlyArray<SchemaModel> }
);

/** The expression a Schema is read from, and the Module it is written in. */
export type ReadSchemaArgs = {
  module: Module;
  /** A `pvl.*` call chain, a `const` holding one, or a `pvl.compile(...)` call, which is read through. */
  expression: Node;
  /** The Local Names `pvl` is imported under from `@pvl/schema`. */
  pvlImportLocalNames: ReadonlySet<string>;
};

const SCHEMA_FACTORIES: ReadonlySet<string> = new Set(Object.values(SCHEMA_FACTORY));

// Every emitter, by the factory whose Schema it compiles. A union has none
// yet, so it is unsupported.
const EMITTER_BY_FACTORY: Readonly<Partial<Record<SchemaFactory, typeof Emitter>>> = {
  [SCHEMA_FACTORY.STRING]: StringSchemaEmitter,
  [SCHEMA_FACTORY.NUMBER]: NumberSchemaEmitter,
  [SCHEMA_FACTORY.BOOLEAN]: BooleanSchemaEmitter,
  [SCHEMA_FACTORY.BIGINT]: BigintSchemaEmitter,
  [SCHEMA_FACTORY.LITERAL]: LiteralSchemaEmitter,
  [SCHEMA_FACTORY.ENUM]: EnumSchemaEmitter,
  [SCHEMA_FACTORY.OBJECT]: ObjectSchemaEmitter,
  [SCHEMA_FACTORY.ARRAY]: ArraySchemaEmitter,
};

/**
 * One Schema written in a Module, which holds any number of them. Its
 * `compile` compiles it whether it is marked to compile or not; which
 * Schemas get compiled is the caller's choice (see
 * `Module.findMarkedToCompileSchemas`).
 *
 * ```ts
 * // /repo/src/schemas/user.ts
 * // export const user = pvl.compile(pvl.object({ name: pvl.string() }));
 * const { schema } = Schema.read({ module: user, expression: <pvl.compile(…)>, pvlImportLocalNames });
 * schema.findUncompilableDiagnostics(); // []: a Compilable Schema
 * schema.compile('PvlCompiledSchema0');  // 'class PvlCompiledSchema0 extends PvlSchema<…> { … }'
 * ```
 */
export class Schema {
  /** The Module it is written in. */
  public readonly module: Module;
  /** The expression it is read from, which compiling it replaces. */
  public readonly expression: Node;
  /** The Schema as read from source. */
  public readonly model: SchemaModel;

  // The Local Names `pvl` is imported under, which mark a factory call.
  private readonly pvlImportLocalNames: ReadonlySet<string>;

  // Throws an UnresolvedNodeError at the first node that can't be read, or a
  // ConstCycleError at a `const` that reaches itself.
  private constructor({ module, expression, pvlImportLocalNames }: ReadSchemaArgs) {
    this.module = module;
    this.expression = expression;
    this.pvlImportLocalNames = pvlImportLocalNames;
    this.model = this.readSchema(expression);
  }

  /**
   * The Schema `expression` holds, or an error on its Module's file:
   * COMPILE_ARGUMENT_UNRESOLVABLE naming the first node that can't be read
   * statically, or COMPILE_ARGUMENT_CYCLE naming a `const` that reaches itself.
   *
   * ```ts
   * // const MIN = 3;
   * // export const user = pvl.compile(pvl.object({ name: pvl.string().min(MIN) }));
   * Schema.read({ expression: <pvl.compile(…)>, … })
   * // { schema: <Schema whose model is { factory: 'object', shape: [{ key: 'name', schema: { factory: 'string', calls: [min(3)] } }] }> }
   * Schema.read({ expression: <pvl.object({ name: pvl.string() })>, … }) // { schema: <Schema> }: not marked, still read
   * // export const home = pvl.compile(importedAddress);
   * Schema.read({ expression: <pvl.compile(importedAddress)>, … }) // { diagnostic: COMPILE_ARGUMENT_UNRESOLVABLE }
   * // const user = pvl.object({ friend: user });
   * Schema.read({ expression: <pvl.compile(user)>, … })            // { diagnostic: COMPILE_ARGUMENT_CYCLE }
   * ```
   */
  public static read(args: ReadSchemaArgs): { schema: Schema } | { diagnostic: Diagnostic } {
    try {
      return { schema: new Schema(args) };
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

  // A `pvl.<factory>(…)` call with methods chained onto it, following
  // `const`s (see `PvlAst.readCallChain`).
  //
  //   pvl.string().min(3)       // { factory: 'string', calls: [min(3)] }
  //   pvl.string().refine(isOk) // { factory: 'string', calls: [refine(args: undefined)] }
  //   user                      // what `const user = …` holds
  //   makeSchema(), z.string()  // unresolvable
  private readSchema(expression: Node, followed?: FollowedConsts): SchemaModel {
    const { factory, methods } = PvlAst.readCallChain(
      expression,
      this.pvlImportLocalNames,
      followed,
    );
    const schema = this.readFactory(factory);
    return {
      ...schema,
      calls: [
        ...schema.calls,
        ...methods.map(({ call, methodName, followed: argumentsFollowed }) => ({
          name: methodName,
          args: Schema.tryReadStaticValues(call.getArguments(), argumentsFollowed),
          line: call.getStartLineNumber(),
        })),
      ],
    };
  }

  /**
   * Its diagnostics, one per problem, each on its Module's file; none means it
   * is a Compilable Schema:
   *
   * - COMPILE_ARGUMENT_NOT_COMPOSITE: it is a primitive, a literal or an enum.
   *   Reported alone, as nothing else of it is checked.
   * - UNSUPPORTED_SCHEMA: it, or a Schema nested in it at any depth, uses
   *   what isn't compiled yet: a union, `.coerce()`, `.refine()`,
   *   `.transform()`, or `.optional()`/`.nullable()` on the Schema itself.
   * - COMPILE_ARGUMENT_UNRESOLVABLE: a compiled method's arguments aren't
   *   literals.
   *
   * ```ts
   * <pvl.compile(pvl.object({ name: pvl.string().min(3) }))>.findUncompilableDiagnostics() // []
   * <pvl.compile(pvl.string())>.findUncompilableDiagnostics()                             // [COMPILE_ARGUMENT_NOT_COMPOSITE]
   * <pvl.compile(pvl.object({ ids: pvl.array(pvl.union([…])) }))>.findUncompilableDiagnostics() // [UNSUPPORTED_SCHEMA]
   * <pvl.compile(pvl.array(pvl.number().refine((n) => n > 0)))>.findUncompilableDiagnostics()  // [UNSUPPORTED_SCHEMA]
   * ```
   */
  public findUncompilableDiagnostics(): Diagnostic[] {
    const { model } = this;
    if (!COMPOSITE_FACTORIES.has(model.factory)) {
      return [
        new Diagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_NOT_COMPOSITE,
          message: `pvl.compile() wraps a \`pvl.${model.factory}()\` on line ${String(model.line)}, which isn't an object or an array. Compile the object or array holding it.`,
          file: this.module.path.absolutePath,
        }),
      ];
    }

    const emitter = EMITTER_BY_FACTORY[model.factory];
    if (emitter === undefined) {
      return [
        new Diagnostic({
          code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
          message: `The \`pvl.${model.factory}()\` on line ${String(model.line)} can't be compiled yet.`,
          file: this.module.path.absolutePath,
        }),
      ];
    }
    return [
      ...model.calls.flatMap(
        (call) => this.findUncompilableCallDiagnostic(emitter, call, true) ?? [],
      ),
      ...Schema.findChildModels(model).flatMap((child) =>
        this.findUncompilableChildDiagnostics(child),
      ),
    ];
  }

  /**
   * Its Compiled Schema: the class declaration named `className`, whose
   * instance replaces its expression, written by the emitter of its factory
   * (see `Emitter.emitCompiledSchema`). Compiles any Schema, marked to
   * compile or not, so long as `findUncompilableDiagnostics` found nothing.
   *
   * ```ts
   * <pvl.compile(pvl.object({ name: pvl.string() })) on line 3>.compile('PvlCompiledSchema0')
   * // // pvl.compile() on line 3
   * // class PvlCompiledSchema0 extends PvlSchema<{ name: string }, { name: string }> { … }
   * ```
   */
  public compile(className: string): string {
    return Schema.findEmitter(this.model).emitCompiledSchema({
      schema: this.model,
      className,
      line: this.expression.getStartLineNumber(),
      findEmitter: Schema.findEmitter,
    });
  }

  // The emitter of a Schema in a Compiled Schema. Only called on a model
  // `findUncompilableDiagnostics` found nothing in; throws for a Schema with
  // no emitter, which is a bug in the compiler, never a user error.
  //
  //   pvl.string()               // StringSchemaEmitter
  //   pvl.union([pvl.string()])  // throws
  private static readonly findEmitter: FindEmitter = (model) => {
    const emitter = EMITTER_BY_FACTORY[model.factory];
    if (emitter === undefined) {
      throw new Error(`A pvl.${model.factory}() has no emitter.`);
    }
    return emitter;
  };

  // The fields' or the element's Schemas of a composite, none for any other.
  //
  //   pvl.object({ a: pvl.string(), b: pvl.number() }) // [pvl.string(), pvl.number()]
  //   pvl.array(pvl.string())                          // [pvl.string()]
  private static findChildModels(model: SchemaModel): ReadonlyArray<SchemaModel> {
    if (model.factory === SCHEMA_FACTORY.OBJECT) {
      return model.shape.map(({ schema }) => schema);
    }
    return model.factory === SCHEMA_FACTORY.ARRAY ? [model.element] : [];
  }

  // The diagnostic for a method chained onto a Schema, if it can't be
  // compiled: `emitter` has no method for it, a Modifier is chained onto
  // this Schema itself (`isRoot`), or its arguments aren't literals.
  //
  //   .min(3) on a string                  // undefined
  //   .refine(isOk) on a string            // UNSUPPORTED_SCHEMA
  //   .optional() on the root object       // UNSUPPORTED_SCHEMA
  //   .min(MIN_FROM_IMPORT) on a string    // COMPILE_ARGUMENT_UNRESOLVABLE
  private findUncompilableCallDiagnostic(
    emitter: typeof Emitter,
    call: SchemaMethodCall,
    isRoot: boolean,
  ): Diagnostic | undefined {
    const isRootModifier = isRoot && ChainableSchemaEmitter._isModifier(call.name);

    if (emitter.findMethod(call.name) === undefined || isRootModifier) {
      return new Diagnostic({
        code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
        message: `\`.${call.name}()\` on line ${String(call.line)} can't be compiled yet${isRootModifier ? ' on the Schema pvl.compile() wraps' : ''}.`,
        file: this.module.path.absolutePath,
      });
    }
    return call.args === undefined
      ? new Diagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
          message: `The arguments of \`.${call.name}()\` on line ${String(call.line)} aren't literals, so they can't be read statically.`,
          file: this.module.path.absolutePath,
        })
      : undefined;
  }

  // The diagnostics for a field's or an element's Schema and every Schema
  // nested in it: one per problem, none when it can be compiled.
  //
  //   pvl.string().min(3)                          // []
  //   pvl.array(pvl.object({ a: pvl.string() }))   // []
  //   pvl.array(pvl.union([…]))                    // [UNSUPPORTED_SCHEMA]
  private findUncompilableChildDiagnostics(model: SchemaModel): Diagnostic[] {
    const emitter = EMITTER_BY_FACTORY[model.factory];
    if (emitter === undefined) {
      return [
        new Diagnostic({
          code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
          message: `The \`pvl.${model.factory}()\` on line ${String(model.line)} is nested in a compiled Schema, which can't be compiled yet.`,
          file: this.module.path.absolutePath,
        }),
      ];
    }
    return [
      ...model.calls.flatMap(
        (call) => this.findUncompilableCallDiagnostic(emitter, call, false) ?? [],
      ),
      ...Schema.findChildModels(model).flatMap((child) =>
        this.findUncompilableChildDiagnostics(child),
      ),
    ];
  }

  // `pvl.<name>(argument)` with nothing chained onto it yet. `compile` reads
  // through to its argument; every other factory but the primitives needs
  // its argument.
  //
  //   pvl.string()                            // { factory: 'string', calls: [] }
  //   pvl.literal('a')                        // { factory: 'literal', literalValue: 'a', … }
  //   pvl.enum(['A', 'B'])                    // { factory: 'enum', members: ['A', 'B'], … }
  //   pvl.object({ name: pvl.string() })      // { factory: 'object', shape: [{ key: 'name', … }], … }
  //   pvl.array(pvl.number())                 // { factory: 'array', element: { factory: 'number', … }, … }
  //   pvl.union([pvl.string(), pvl.number()]) // { factory: 'union', members: [string, number], … }
  //   pvl.compile(pvl.string())               // the argument's Schema
  private readFactory({ call, methodName, followed }: CallChainLink): SchemaModel {
    const [argument] = call.getArguments();
    const base = { calls: [], line: call.getStartLineNumber() };
    if (methodName === 'compile' && argument !== undefined) {
      return this.readSchema(argument, followed);
    }
    if (!SCHEMA_FACTORIES.has(methodName)) {
      throw new UnresolvedNodeError(call);
    }
    const factory = methodName as SchemaFactory;
    if (
      factory === SCHEMA_FACTORY.STRING ||
      factory === SCHEMA_FACTORY.NUMBER ||
      factory === SCHEMA_FACTORY.BOOLEAN ||
      factory === SCHEMA_FACTORY.BIGINT
    ) {
      return { ...base, factory };
    }
    if (argument === undefined) {
      throw new UnresolvedNodeError(call);
    }
    switch (factory) {
      case SCHEMA_FACTORY.LITERAL:
        return { ...base, factory, literalValue: Schema.readLiteralValue(argument, followed) };
      case SCHEMA_FACTORY.ENUM:
        return { ...base, factory, members: Schema.readEnumMembers(argument, followed) };
      case SCHEMA_FACTORY.OBJECT:
        return {
          ...base,
          factory,
          shape: Object.entries(
            GenericAst.readObject(
              argument,
              (field, fieldFollowed) => this.readSchema(field, fieldFollowed),
              followed,
            ),
          ).map(([key, schema]) => ({ key, schema })),
        };
      case SCHEMA_FACTORY.ARRAY:
        return { ...base, factory, element: this.readSchema(argument, followed) };
      case SCHEMA_FACTORY.UNION:
        return {
          ...base,
          factory,
          members: GenericAst.readArray(
            argument,
            (member, memberFollowed) => this.readSchema(member, memberFollowed),
            followed,
          ),
        };
    }
  }

  // `pvl.literal()`'s argument: a literal that isn't an object or an array.
  private static readLiteralValue(argument: Node, followed: FollowedConsts): PossibleLiteralValue {
    const value = GenericAst.readStaticValue(argument, followed);
    if (typeof value === 'object') {
      throw new UnresolvedNodeError(argument);
    }
    return value;
  }

  // `pvl.enum()`'s argument, a string array or an object of strings and
  // numbers, as its members, each once, as `EnumSchema` keeps them in a Set.
  //
  //   ['A', 'B', 'A']  // ['A', 'B']
  //   { A: 'a', B: 1 } // ['a', 1]
  private static readEnumMembers(argument: Node, followed: FollowedConsts): EnumMember[] {
    const value = GenericAst.readStaticValue(argument, followed);
    const members = typeof value === 'object' ? Object.values(value) : [];
    if (
      members.length === 0 ||
      !members.every(
        (member): member is EnumMember => typeof member === 'string' || typeof member === 'number',
      )
    ) {
      throw new UnresolvedNodeError(argument);
    }
    return [...new Set(members)];
  }

  // A method's arguments, or `undefined` when one isn't a literal. A `const`
  // that reaches itself is still thrown: it is no "not a literal".
  private static tryReadStaticValues(
    args: ReadonlyArray<Node>,
    followed: FollowedConsts,
  ): StaticValue[] | undefined {
    try {
      return args.map((argument) => GenericAst.readStaticValue(argument, followed));
    } catch (error) {
      if (error instanceof UnresolvedNodeError) {
        return undefined;
      }
      throw error;
    }
  }
}
