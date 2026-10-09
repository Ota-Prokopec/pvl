// Turns a SchemaModel into the class a Compiled Schema is: a subclass of
// `@pvl/schema`'s `Schema` whose single `_checkType` holds every check of
// the whole Schema as straight-line code, nested Schemas inlined rather than
// called (ADR-0023). Finds the emitter of the Schema `pvl.compile()` wraps,
// which does the emitting, and reports what can't be compiled yet.
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../../diagnostics/enums.js';
import { COMPOSITE_FACTORIES, EMITTER_BY_FACTORY } from './consts.js';
import { SCHEMA_FACTORY } from './enums.js';
import { ChainableSchemaEmitter } from './emitters/chainableSchemaEmitter.js';
import type { EmitCompiledSchemaArgs, Emitter } from './emitters/emitter.js';
import { FLAT_EMITTER_BY_FACTORY } from './emitters/flatEmitters.js';
import type { SchemaMethodCall, SchemaModel } from './schemaModel.js';

export type { EmitCompiledSchemaArgs } from './emitters/emitter.js';

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
   * - UNSUPPORTED_SCHEMA: it, or a field or element of it, uses what isn't
   *   compiled yet: a nested composite, a union, `.coerce()`, `.refine()`,
   *   `.transform()`, or `.optional()`/`.nullable()` on the wrapped Schema.
   * - COMPILE_ARGUMENT_UNRESOLVABLE: a compiled method's arguments aren't
   *   literals.
   *
   * ```ts
   * pvl.object({ name: pvl.string().min(3) })        // []
   * pvl.string()                                     // [COMPILE_ARGUMENT_NOT_COMPOSITE]
   * pvl.object({ tags: pvl.array(pvl.string()) })   // [UNSUPPORTED_SCHEMA]
   * pvl.array(pvl.number().refine((n) => n > 0))    // [UNSUPPORTED_SCHEMA]
   * ```
   */
  public static findUncompilableDiagnostics(schema: SchemaModel): Diagnostic[] {
    if (!COMPOSITE_FACTORIES.has(schema.factory)) {
      return [
        createDiagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_NOT_COMPOSITE,
          message: `pvl.compile() wraps a \`pvl.${schema.factory}()\` on line ${String(schema.line)}, which isn't an object or an array. Compile the object or array holding it.`,
        }),
      ];
    }

    const emitter = EMITTER_BY_FACTORY[schema.factory];
    if (emitter === undefined) {
      return [
        createDiagnostic({
          code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
          message: `The \`pvl.${schema.factory}()\` on line ${String(schema.line)} can't be compiled yet.`,
        }),
      ];
    }
    const children =
      schema.factory === SCHEMA_FACTORY.OBJECT
        ? schema.shape.map(({ schema: fieldSchema }) => fieldSchema)
        : schema.factory === SCHEMA_FACTORY.ARRAY
          ? [schema.element]
          : [];
    return [
      ...schema.calls.flatMap(
        (call) => CompiledSchemaWriter.findUncompilableCallDiagnostic(emitter, call, true) ?? [],
      ),
      ...children.flatMap((child) => CompiledSchemaWriter.findUncompilableChildDiagnostics(child)),
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
  public static emitCompiledSchema(args: EmitCompiledSchemaArgs): string {
    const emitter = EMITTER_BY_FACTORY[args.schema.factory];
    if (emitter === undefined) {
      throw new Error(`A pvl.${args.schema.factory}() has no emitter.`); //TODO: Maybe make this as a diagnostic or remove all diagnostics and throw errors and catch them in compile() function
    }
    return emitter.emitCompiledSchema(args);
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
      return createDiagnostic({
        code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
        message: `\`.${call.name}()\` on line ${String(call.line)} can't be compiled yet${isRootModifier ? ' on the Schema pvl.compile() wraps' : ''}.`,
      });
    }
    return call.args === undefined
      ? createDiagnostic({
          code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
          message: `The arguments of \`.${call.name}()\` on line ${String(call.line)} aren't literals, so they can't be read statically.`,
        })
      : undefined;
  }

  /**
   * The diagnostics for a field's or an element's Schema: one per problem,
   * none when it can be compiled.
   *
   * ```ts
   * findUncompilableChildDiagnostics(<pvl.string().min(3)>)    // []
   * findUncompilableChildDiagnostics(<pvl.array(pvl.string())>) // [UNSUPPORTED_SCHEMA]
   * ```
   */
  private static findUncompilableChildDiagnostics(schema: SchemaModel): Diagnostic[] {
    const emitter = FLAT_EMITTER_BY_FACTORY[schema.factory];
    if (emitter === undefined) {
      return [
        createDiagnostic({
          code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
          message: `The \`pvl.${schema.factory}()\` on line ${String(schema.line)} is nested in a compiled Schema, which can't be compiled yet.`,
        }),
      ];
    }
    return schema.calls.flatMap(
      (call) => CompiledSchemaWriter.findUncompilableCallDiagnostic(emitter, call, false) ?? [],
    );
  }
}
