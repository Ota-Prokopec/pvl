// Turns a SchemaModel into the class a Compiled Schema is: a subclass of
// `@pvl/schema`'s `Schema` whose single `_checkType` holds every check of
// the whole Schema as straight-line code, nested objects and arrays inlined
// rather than called (ADR-0023). Finds the emitter of the Schema `pvl.compile()` wraps,
// which does the emitting, and reports what can't be compiled yet.
import { Diagnostic } from '../../diagnostics/diagnostic.js';
import { COMPOSITE_FACTORIES } from '../../consts.js';
import { ArraySchemaEmitter } from '../../emiters/arraySchemaEmitter.js';
import { BigintSchemaEmitter } from '../../emiters/bigintSchemaEmitter.js';
import { BooleanSchemaEmitter } from '../../emiters/booleanSchemaEmitter.js';
import { ChainableSchemaEmitter } from '../../emiters/chainableSchemaEmitter.js';
import { EnumSchemaEmitter } from '../../emiters/enumSchemaEmitter.js';
import { LiteralSchemaEmitter } from '../../emiters/literalSchemaEmitter.js';
import { NumberSchemaEmitter } from '../../emiters/numberSchemaEmitter.js';
import { ObjectSchemaEmitter } from '../../emiters/objectSchemaEmitter.js';
import { StringSchemaEmitter } from '../../emiters/stringSchemaEmitter.js';
import type { FindEmitter } from '../../emiters/emitScope.js';
import type { EmitCompiledSchemaArgs, Emitter } from '../../emiters/emitter.js';
import { DIAGNOSTIC_CODE, SCHEMA_FACTORY, type SchemaFactory } from '../../enums.js';
import type { SchemaMethodCall, SchemaModel } from './schemaModel.js';

/** Every emitter, by the factory whose Schema it compiles. A union has none yet, so it is unsupported. */
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

/** What `CompiledSchemaWriter.emitCompiledSchema` writes a class for. */
export type WriteCompiledSchemaArgs = Omit<EmitCompiledSchemaArgs, 'findEmitter'>;

/**
 * The emitter of a Schema nested in a Compiled Schema. Only called on a
 * SchemaModel `CompiledSchemaWriter.findUncompilableDiagnostics` found
 * nothing in; throws for a Schema with no emitter, which is a bug in the
 * compiler, never a user error.
 *
 * ```ts
 * findEmitter(<pvl.string()>)                       // StringSchemaEmitter
 * findEmitter(<pvl.union([pvl.string()])>)           // throws
 * ```
 */
const findEmitter: FindEmitter = (schema) => {
  const emitter = EMITTER_BY_FACTORY[schema.factory];
  if (emitter === undefined) {
    throw new Error(`A pvl.${schema.factory}() has no emitter.`);
  }
  return emitter;
};

/**
 * The fields' or the element's Schemas of a composite, none for any other.
 *
 * ```ts
 * findChildSchemas(<pvl.object({ a: pvl.string(), b: pvl.number() })>) // [<pvl.string()>, <pvl.number()>]
 * findChildSchemas(<pvl.array(pvl.string())>)                          // [<pvl.string()>]
 * ```
 */
const findChildSchemas = (schema: SchemaModel): ReadonlyArray<SchemaModel> => {
  if (schema.factory === SCHEMA_FACTORY.OBJECT) {
    return schema.shape.map(({ schema: fieldSchema }) => fieldSchema);
  }
  return schema.factory === SCHEMA_FACTORY.ARRAY ? [schema.element] : [];
};

/**
 * Writes the class a Compiled Schema is, through the emitter of the Schema
 * `pvl.compile()` wraps, after reporting whatever in it can't be compiled
 * yet.
 *
 * ```ts
 * CompiledSchemaWriter.findUncompilableDiagnostics(schema) // []: a Compilable Schema
 * CompiledSchemaWriter.emitCompiledSchema({ schema, className: 'PvlCompiledSchema0', line: 3 })
 * ```
 */
export class CompiledSchemaWriter {
  /**
   * The diagnostics for the Schema a `pvl.compile()` wraps, one per problem;
   * none means it is a Compilable Schema. They carry no `file`, which the
   * caller adds:
   *
   * - COMPILE_ARGUMENT_NOT_COMPOSITE: it is a primitive, a literal or an enum.
   *   Reported alone, as nothing else of it is checked.
   * - UNSUPPORTED_SCHEMA: it, or a Schema nested in it at any depth, uses
   *   what isn't compiled yet: a union, `.coerce()`, `.refine()`,
   *   `.transform()`, or `.optional()`/`.nullable()` on the wrapped Schema.
   * - COMPILE_ARGUMENT_UNRESOLVABLE: a compiled method's arguments aren't
   *   literals.
   *
   * ```ts
   * pvl.object({ name: pvl.string().min(3) })        // []
   * pvl.string()                                     // [COMPILE_ARGUMENT_NOT_COMPOSITE]
   * pvl.object({ tags: pvl.array(pvl.string()) })   // []
   * pvl.object({ ids: pvl.array(pvl.union([…])) })   // [UNSUPPORTED_SCHEMA]
   * pvl.array(pvl.number().refine((n) => n > 0))    // [UNSUPPORTED_SCHEMA]
   * ```
   */
  public static findUncompilableDiagnostics(schema: SchemaModel): Diagnostic[] {
    if (!COMPOSITE_FACTORIES.has(schema.factory)) {
      return [
        new Diagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_NOT_COMPOSITE,
          message: `pvl.compile() wraps a \`pvl.${schema.factory}()\` on line ${String(schema.line)}, which isn't an object or an array. Compile the object or array holding it.`,
        }),
      ];
    }

    const emitter = EMITTER_BY_FACTORY[schema.factory];
    if (emitter === undefined) {
      return [
        new Diagnostic({
          code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
          message: `The \`pvl.${schema.factory}()\` on line ${String(schema.line)} can't be compiled yet.`,
        }),
      ];
    }
    return [
      ...schema.calls.flatMap(
        (call) => CompiledSchemaWriter.findUncompilableCallDiagnostic(emitter, call, true) ?? [],
      ),
      ...findChildSchemas(schema).flatMap((child) =>
        CompiledSchemaWriter.findUncompilableChildDiagnostics(child),
      ),
    ];
  }

  /**
   * The class declaration a Compiled Schema is, written by the emitter of the
   * Schema `pvl.compile()` wraps (see `Emitter.emitCompiledSchema`).
   *
   * ```ts
   * CompiledSchemaWriter.emitCompiledSchema({ schema: <pvl.object({ name: pvl.string() })>, className: 'PvlCompiledSchema0', line: 3 })
   * // // pvl.compile() on line 3
   * // class PvlCompiledSchema0 extends PvlSchema<{ name: string }, { name: string }> { … }
   * ```
   */
  public static emitCompiledSchema(args: WriteCompiledSchemaArgs): string {
    return findEmitter(args.schema).emitCompiledSchema({ ...args, findEmitter });
  }

  /**
   * The diagnostic for a method chained onto a Schema, if it can't be
   * compiled: `emitter` has no method for it, a Modifier is chained onto the
   * Schema `pvl.compile()` wraps (`isRoot`), or its arguments aren't literals.
   *
   * ```ts
   * CompiledSchemaWriter.findUncompilableCallDiagnostic(StringSchemaEmitter, <.min(3)>, false)      // undefined
   * CompiledSchemaWriter.findUncompilableCallDiagnostic(StringSchemaEmitter, <.refine(isOk)>, false) // UNSUPPORTED_SCHEMA
   * CompiledSchemaWriter.findUncompilableCallDiagnostic(ObjectSchemaEmitter, <.optional()>, true)    // UNSUPPORTED_SCHEMA
   * CompiledSchemaWriter.findUncompilableCallDiagnostic(StringSchemaEmitter, <.min(MIN_FROM_IMPORT)>, false) // COMPILE_ARGUMENT_UNRESOLVABLE
   * ```
   */
  private static findUncompilableCallDiagnostic(
    emitter: typeof Emitter,
    call: SchemaMethodCall,
    isRoot: boolean,
  ): Diagnostic | undefined {
    const isRootModifier = isRoot && ChainableSchemaEmitter._isModifier(call.name);

    if (emitter.findMethod(call.name) === undefined || isRootModifier) {
      return new Diagnostic({
        code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
        message: `\`.${call.name}()\` on line ${String(call.line)} can't be compiled yet${isRootModifier ? ' on the Schema pvl.compile() wraps' : ''}.`,
      });
    }
    return call.args === undefined
      ? new Diagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
          message: `The arguments of \`.${call.name}()\` on line ${String(call.line)} aren't literals, so they can't be read statically.`,
        })
      : undefined;
  }

  /**
   * The diagnostics for a field's or an element's Schema and every Schema
   * nested in it: one per problem, none when it can be compiled.
   *
   * ```ts
   * findUncompilableChildDiagnostics(<pvl.string().min(3)>)                   // []
   * findUncompilableChildDiagnostics(<pvl.array(pvl.object({ a: pvl.string() }))>) // []
   * findUncompilableChildDiagnostics(<pvl.array(pvl.union([…]))>)             // [UNSUPPORTED_SCHEMA]
   * ```
   */
  private static findUncompilableChildDiagnostics(schema: SchemaModel): Diagnostic[] {
    const emitter = EMITTER_BY_FACTORY[schema.factory];
    if (emitter === undefined) {
      return [
        new Diagnostic({
          code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
          message: `The \`pvl.${schema.factory}()\` on line ${String(schema.line)} is nested in a compiled Schema, which can't be compiled yet.`,
        }),
      ];
    }
    return [
      ...schema.calls.flatMap(
        (call) => CompiledSchemaWriter.findUncompilableCallDiagnostic(emitter, call, false) ?? [],
      ),
      ...findChildSchemas(schema).flatMap((child) =>
        CompiledSchemaWriter.findUncompilableChildDiagnostics(child),
      ),
    ];
  }
}
