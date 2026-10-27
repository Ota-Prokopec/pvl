// The diagnostics `Schema.findUncompilableDiagnostics` reports: a Schema
// with no Emitter, and a method chained onto it that can't be compiled.
import type { PvlFactoryName } from '@pvl/schema';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import type { Emitter } from '../emitters/emitter.js';
import type { SchemaModifierCall } from './types/modifierCall.js';

/** What {@link createUnsupportedSchemaDiagnostic} reports: a Schema's factory, the line it is written on, and its Module's file. */
export type CreateUnsupportedSchemaDiagnosticArgs = {
  factory: PvlFactoryName;
  line: number;
  file: string;
};

/**
 * The UNSUPPORTED_SCHEMA diagnostic of a Schema with no Emitter yet.
 *
 * ```ts
 * createUnsupportedSchemaDiagnostic({ factory: 'union', line: 3, file }) // UNSUPPORTED_SCHEMA: 'The `pvl.union()` on line 3 can't be compiled yet.'
 * ```
 */
export const createUnsupportedSchemaDiagnostic = ({
  factory,
  line,
  file,
}: CreateUnsupportedSchemaDiagnosticArgs): Diagnostic => {
  return new Diagnostic({
    code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
    message: `The \`pvl.${factory}()\` on line ${String(line)} can't be compiled yet.`,
    file,
  });
};

/** What {@link findUncompilableCallDiagnostic} checks: a method chained onto a Schema, the Emitter compiling that Schema, and its Module's file. */
export type FindUncompilableCallDiagnosticArgs = {
  emitter: typeof Emitter;
  call: SchemaModifierCall;
  file: string;
};

/**
 * The diagnostic for a method chained onto a Schema, if it can't be
 * compiled: `emitter` has no method for it, or one of its arguments is
 * spread.
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
export const findUncompilableCallDiagnostic = ({
  emitter,
  call,
  file,
}: FindUncompilableCallDiagnosticArgs): Diagnostic | undefined => {
  if (!emitter.compilesMethod({ name: call.name })) {
    return new Diagnostic({
      code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
      message: `\`.${call.name}()\` on line ${String(call.line)} can't be compiled yet.`,
      file,
    });
  }
  return call.args === undefined
    ? new Diagnostic({
        code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
        message: `An argument of \`.${call.name}()\` on line ${String(call.line)} is spread, so it has no fixed position for the Compiled Schema to pass it at.`,
        file,
      })
    : undefined;
};
