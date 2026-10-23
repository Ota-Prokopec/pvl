// Reading Schemas from source, statically (ADR-0002): every Marked-to-Compile
// Schema of a Module, and the `pvl.*` call chain an expression holds, read
// into the Schema subclass of its factory, with every Schema nested in it.
// This module holds the map from each factory to its subclass, so it imports
// every subclass, and nothing has to load `src/schemas/` before a Schema is
// read. Nothing imports it back: `schema.ts` never does, and a subclass reads
// the Schemas nested in it through the `readNested` it is handed (ADR-0034).
import type { Node } from 'ts-morph';
import { ConstCycleError } from '../ast/constCycleError.js';
import { GenericAst, type FollowedConsts } from '../ast/genericAst.js';
import { PvlAst, type CallChainLink, type ChainedMethodCall } from '../ast/pvlAst.js';
import { UnresolvedNodeError } from '../ast/unresolvedNodeError.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { MODIFIER_NAME, SCHEMA_FACTORY, type SchemaFactory } from '../enums.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import type { Module } from '../module.js';
import { ArraySchema } from './arraySchema.js';
import { BigintSchema } from './bigintSchema.js';
import { BooleanSchema } from './booleanSchema.js';
import { EnumSchema } from './enumSchema.js';
import { LiteralSchema } from './literalSchema.js';
import { NumberSchema } from './numberSchema.js';
import { ObjectSchema } from './objectSchema.js';
import { RuntimeArgument } from './runtimeArgument.js';
import type { ReadFactoryArgs, Schema, SchemaOptions } from './schema.js';
import type { SchemaModifierCall, SchemaModifierCallArgument } from './schemaTypes.js';
import { StringSchema } from './stringSchema.js';
import { UnionSchema } from './unionSchema.js';

/** A Schema subclass, as `readSchema` picks one by the factory it reads. */
type SchemaClass = {
  /** The `pvl.*` factory it reads. */
  readonly factory: SchemaFactory;
  /**
   * Reads the argument of `link`, its factory call, and returns how its
   * Schema is built from what every Schema holds, which is read after the
   * argument.
   */
  readFactoryArgument: (
    link: CallChainLink,
    args: ReadFactoryArgs,
  ) => (options: SchemaOptions) => Schema;
};

/** Every Schema subclass, by the `pvl.*` factory it reads, which is the subclass's own `factory`. */
const SCHEMA_CLASS_BY_FACTORY = {
  [SCHEMA_FACTORY.STRING]: StringSchema,
  [SCHEMA_FACTORY.NUMBER]: NumberSchema,
  [SCHEMA_FACTORY.BOOLEAN]: BooleanSchema,
  [SCHEMA_FACTORY.BIGINT]: BigintSchema,
  [SCHEMA_FACTORY.LITERAL]: LiteralSchema,
  [SCHEMA_FACTORY.ENUM]: EnumSchema,
  [SCHEMA_FACTORY.OBJECT]: ObjectSchema,
  [SCHEMA_FACTORY.ARRAY]: ArraySchema,
  [SCHEMA_FACTORY.UNION]: UnionSchema,
} satisfies { readonly [Factory in SchemaFactory]: SchemaClass & { readonly factory: Factory } };

/** A parsed scanned module with its `pvl.compile(...)` calls read, ready to be compiled in place. */
export type ModuleCompilation = {
  module: Module;
  /** Its Marked-to-Compile Schemas that compile. */
  schemas: Schema[];
  /** The errors of its `pvl.compile(...)` calls that don't. */
  diagnostics: Diagnostic[];
};

/**
 * Finds every Marked-to-Compile Schema in `module`, one per
 * `pvl.compile(...)` call, keeping the ones that compile and reporting each
 * one that doesn't with its errors:
 *
 * - COMPILE_RESULT_MODIFIED: something is chained onto the result
 *   (`pvl.compile(user).optional()`).
 * - COMPILE_ARGUMENT_UNRESOLVABLE: the argument can't be read statically, as
 *   when it is imported, built by a function or spread.
 * - COMPILE_ARGUMENT_CYCLE: the argument follows a `const` that refers back
 *   to itself.
 * - UNSUPPORTED_SCHEMA, and COMPILE_ARGUMENT_UNRESOLVABLE for a spread
 *   method argument: see Schema.findUncompilableDiagnostics, one error per
 *   problem.
 *
 * ```ts
 * // /repo/src/schemas/user.ts
 * import { pvl } from '@pvl/schema';
 * import { address } from './address.js';
 * export const user = pvl.compile(pvl.object({ name: pvl.string() }));
 * export const home = pvl.compile(address);
 * findMarkedToCompileSchemas(<user.ts>)
 * // { module: <user.ts>, schemas: [<ObjectSchema>], diagnostics: [COMPILE_ARGUMENT_UNRESOLVABLE] }
 * ```
 *
 * A module that doesn't import `pvl` from `@pvl/schema` has no call to read.
 */
export const findMarkedToCompileSchemas = (module: Module): ModuleCompilation => {
  const diagnostics: Diagnostic[] = [];
  const schemas: Schema[] = [];
  const pvlImportLocalNames = PvlAst.findPvlImportLocalNames(module.moduleFile);

  for (const call of PvlAst.findCompileCalls(module.moduleFile, pvlImportLocalNames)) {
    const line = call.getStartLineNumber();
    const modifierName = PvlAst.findModifierOnCompileMarker(call);

    if (modifierName !== undefined) {
      diagnostics.push(
        new Diagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_RESULT_MODIFIED,
          message: `\`.${modifierName}\` is chained onto the result of pvl.compile() on line ${String(line)}, which is a plain Schema. Chain it inside: pvl.compile(schema.${modifierName}(…)).`,
          file: module.path.absolutePath,
        }),
      );
      continue;
    }

    // The whole call, which the Schema is read through and which compiling replaces.
    const schemaPayload = readSchema({ module, expression: call, pvlImportLocalNames });

    if ('diagnostic' in schemaPayload) {
      diagnostics.push(schemaPayload.diagnostic);
      continue;
    }

    const uncompilableDiagnostics = schemaPayload.schema.findUncompilableDiagnostics();
    if (uncompilableDiagnostics.length > 0) {
      diagnostics.push(...uncompilableDiagnostics);
      continue;
    }

    schemas.push(schemaPayload.schema);
  }
  return { module, schemas, diagnostics };
};

/** The expression a Schema is read from, and the Module it is written in. */
export type ReadSchemaArgs = {
  module: Module;
  /** A `pvl.*` call chain, a `const` holding one, or a `pvl.compile(...)` call, which is read through. */
  expression: Node;
  /** The Local Names `pvl` is imported under from `@pvl/schema`. */
  pvlImportLocalNames: ReadonlySet<string>;
};

/**
 * The Schema `expression` holds, as the subclass of its factory, or an
 * error on its Module's file: COMPILE_ARGUMENT_UNRESOLVABLE naming the
 * first node that can't be read statically, or COMPILE_ARGUMENT_CYCLE
 * naming a `const` that reaches itself. Only a call chain or a factory's
 * argument can fail to read: a method's argument that isn't a literal is a
 * Runtime Argument, and a spread one is reported by
 * `Schema.findUncompilableDiagnostics` once the Schema is read, so it never
 * hides an argument of a factory that can't be read.
 *
 * ```ts
 * // const name = pvl.string().min(3);
 * // export const user = pvl.compile(pvl.object({ name }));
 * readSchema({ expression: <pvl.compile(…)>, … })
 * // { schema: <ObjectSchema whose shape is [{ key: 'name', schema: <StringSchema with calls [min(3)]> }]> }
 * readSchema({ expression: <pvl.object({ name: pvl.string() })>, … }) // { schema: <ObjectSchema> }: not marked, still read
 * // export const getName = (max: number) => pvl.compile(pvl.string().max(max));
 * readSchema({ expression: <pvl.compile(…)>, … }) // { schema: <StringSchema with calls [max(<Runtime Argument max>)]> }
 * // export const home = pvl.compile(importedAddress);
 * readSchema({ expression: <pvl.compile(importedAddress)>, … })    // { diagnostic: COMPILE_ARGUMENT_UNRESOLVABLE }
 * // export const tags = pvl.compile(pvl.array('a').max(...limits));
 * readSchema({ expression: <pvl.compile(…)>, … })                  // { diagnostic: COMPILE_ARGUMENT_UNRESOLVABLE }, at <'a'>
 * // const user = pvl.object({ friend: user });
 * readSchema({ expression: <pvl.compile(user)>, … })               // { diagnostic: COMPILE_ARGUMENT_CYCLE }
 * ```
 */
export const readSchema = (
  args: ReadSchemaArgs,
): { schema: Schema } | { diagnostic: Diagnostic } => {
  try {
    return { schema: readExpression({ ...args, runtimeArguments: [] }, args.expression) };
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
};

/** What a Schema is read with: what it was asked to read, and the Runtime Arguments its `pvl.compile(...)` call reaches so far, in the order they are read. */
type ReadingArgs = ReadSchemaArgs & {
  readonly runtimeArguments: RuntimeArgument[];
};

/**
 * The Schema `expression` holds: a `pvl.<factory>(…)` call with methods
 * chained onto it, following `const`s (see `PvlAst.readCallChain`), as the
 * subclass of its factory. `pvl.compile(…)` is read through to its
 * argument, which keeps `args.expression` as its own and is chained, after
 * its own methods, the ones chained onto the call (`outerMethods`, in chain
 * order). It reads in the order the Schema is written, which is the order
 * its Runtime Arguments are numbered in: the factory's argument, with every
 * Schema nested in it, then the methods chained onto the call. Throws an
 * UnresolvedNodeError at the first node that can't be read, or a
 * ConstCycleError at a `const` that reaches itself.
 *
 * ```ts
 * readExpression(args, <pvl.string().min(3)>)       // <StringSchema with calls [min(3)]>
 * readExpression(args, <pvl.string().refine(isOk)>) // <StringSchema with calls [refine(<Runtime Argument isOk>)]>
 * readExpression(args, <pvl.string().transform(trim)>) // <StringSchema with calls [] and transformCall transform(<Runtime Argument trim>)>
 * readExpression(args, <user>)                      // what `const user = …` holds
 * readExpression(args, <pvl.compile(pvl.string())>) // <StringSchema> read from <pvl.compile(…)>
 * readExpression(args, <pvl.object({ name: pvl.string().max(max) }).strict(options)>)
 * // <ObjectSchema with calls [strict(<Runtime Argument options, the 2nd>)]>, whose field reads <Runtime Argument max, the 1st>
 * readExpression(args, <makeSchema()>)              // throws
 * ```
 */
const readExpression = (
  args: ReadingArgs,
  expression: Node,
  followed?: FollowedConsts,
  outerMethods: ReadonlyArray<ChainedMethodCall> = [],
): Schema => {
  const { factory, methods } = PvlAst.readCallChain(expression, args.pvlImportLocalNames, followed);
  const chainedMethods = [...methods, ...outerMethods];
  const [argument] = factory.call.getArguments();
  if (factory.methodName === 'compile' && argument !== undefined) {
    return readExpression(args, argument, factory.followed, chainedMethods);
  }
  if (!isSchemaFactory(factory.methodName)) {
    throw new UnresolvedNodeError(factory.call);
  }

  const schemaClass: SchemaClass = SCHEMA_CLASS_BY_FACTORY[factory.methodName];
  const buildSchema = schemaClass.readFactoryArgument(factory, {
    readNested: (nestedExpression, nestedFollowed) =>
      readExpression({ ...args, expression: nestedExpression }, nestedExpression, nestedFollowed),
  });
  // Read once the factory's argument is, as they are written after it.
  const calls = chainedMethods.map((method) => readMethodCall(method, args.runtimeArguments));
  return buildSchema({
    module: args.module,
    expression: args.expression,
    line: factory.call.getStartLineNumber(),
    calls: calls.filter((call) => call.name !== MODIFIER_NAME.TRANSFORM),
    transformCall: calls.find((call) => call.name === MODIFIER_NAME.TRANSFORM),
  });
};

/**
 * Whether `methodName` is a `pvl.*` factory a subclass reads, rather than
 * another method of `pvl` or a name every object has.
 *
 * ```ts
 * isSchemaFactory('string')   // true
 * isSchemaFactory('compile')  // false
 * isSchemaFactory('toString') // false
 * ```
 */
const isSchemaFactory = (methodName: string): methodName is SchemaFactory =>
  Object.hasOwn(SCHEMA_CLASS_BY_FACTORY, methodName);

/**
 * `method`, a method chained onto a Schema, with its arguments read (see
 * `readMethodArguments`), each Runtime Argument added to
 * `runtimeArguments`.
 *
 * ```ts
 * readMethodCall(<.min(3)>, [])   // { name: 'min', args: [3], line: 1 }
 * readMethodCall(<.min(min)>, []) // { name: 'min', args: [<Runtime Argument min>], line: 1 }
 * ```
 */
const readMethodCall = (
  { call, methodName }: ChainedMethodCall,
  runtimeArguments: RuntimeArgument[],
): SchemaModifierCall => ({
  name: methodName,
  args: readMethodArguments(call.getArguments(), runtimeArguments),
  line: call.getStartLineNumber(),
});

/**
 * A method's arguments, each read as the literal it is written as
 * (`GenericAst.readLiteral`), or else a Runtime Argument, numbered on from
 * the ones `runtimeArguments` holds, which it is added to. A `const` is
 * never followed, so one is read where it is written, as the interpreted
 * path reads it (ADR-0030). `undefined` when one is spread (`...limits`,
 * or `{ ...options }` written in place), as it has no fixed position.
 * Never throws for an argument it can't read.
 *
 * ```ts
 * readMethodArguments([<3>, <{ message: 'short' }>], []) // [3, { message: 'short' }]
 * readMethodArguments([<MIN>], [])                       // [<Runtime Argument MIN>], with `const MIN = 3`
 * readMethodArguments([<min>, <options>], [])            // [<Runtime Argument min>, <Runtime Argument options>], with parameters `min` and `options`
 * readMethodArguments([<...limits>], [])                 // undefined
 * ```
 */
const readMethodArguments = (
  args: ReadonlyArray<Node>,
  runtimeArguments: RuntimeArgument[],
): SchemaModifierCallArgument[] | undefined => {
  if (args.some((argument) => GenericAst.isSpread(argument))) {
    return undefined;
  }
  return args.map((argument) => {
    try {
      return GenericAst.readLiteral(argument);
    } catch (error) {
      if (!(error instanceof UnresolvedNodeError)) {
        throw error;
      }
      const runtimeArgument = new RuntimeArgument(argument, runtimeArguments.length);
      runtimeArguments.push(runtimeArgument);
      return runtimeArgument;
    }
  });
};
