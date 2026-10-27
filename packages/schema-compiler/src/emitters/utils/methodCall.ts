// How a chained method is dispatched to the emitter method of its name
// (ADR-0033): its arguments as that method takes them, and the method
// looked up in the table of the kind of step it writes.
import type { Schema } from '../../schemas/schema.js';
import type { SchemaModifierCall, SchemaModifierCallArgument } from '../../schemas/schemaTypes.js';
import type {
  EmitterMethodInput,
  EmitterMethodStep,
  EmitterMethodTable,
} from '../types/methodTables.js';

/**
 * `call`'s arguments, as the emitter method of its name takes them. The
 * compiler reads syntax, not types (ADR-0024), so it trusts them to be what
 * that method's parameters declare, as the application's own type check
 * holds them to be: the table it is dispatched through takes any
 * (`EmitterMethodTable`). The one place a call's arguments are handed to an emitter method. Only called on a
 * Schema `Schema.findUncompilableDiagnostics` found nothing in, so none is
 * spread.
 *
 * ```ts
 * readCallArguments(<.min(3, { message: 'short' })>) // [3, { message: 'short' }]
 * readCallArguments(<.optional()>)                  // []
 * ```
 */
export const readCallArguments = (
  call: SchemaModifierCall,
): ReadonlyArray<SchemaModifierCallArgument> => {
  return call.args ?? [];
};

/** What {@link emitMethodCall} emits a chained method with: the table of the kind of step it writes, the call, what the method it is dispatched to reads besides its arguments, and the name of the emitter dispatching it. */
type EmitMethodCallArgs<TStep extends EmitterMethodStep> = Omit<
  EmitterMethodInput<never, Schema>,
  'args'
> & {
  table: EmitterMethodTable<TStep>;
  call: SchemaModifierCall;
  /** Names the emitter in the error thrown when `table` has no method for `call`. */
  emitterName: string;
};

/**
 * What `call` compiles to, written at `target` by the method of its name
 * in `table`, which holds the methods writing one kind of step: a
 * post-modifier's, such as `.min(3)`'s check, or a pre-modifier's, such as
 * `.optional()`'s short-circuit condition; `undefined` for a method
 * writing nothing, such as an object's `.coerce()`. Typed by the table, so
 * what it writes needs no cast. Only called on a Schema
 * `Schema.findUncompilableDiagnostics` found nothing in, so the method and
 * its arguments are there. Throws when `table` has no method of its name,
 * which is a bug in an emitter, never a user error.
 *
 * ```ts
 * emitMethodCall({ table: StringSchemaEmitter.preModifierSteps, call: <.optional()>, schema, target: { value: 'field0', path, issuePath }, schemaTarget: <the same>, compositeLocals: undefined, emitterName: 'StringSchemaEmitter' })
 * // { shortCircuitCondition: 'field0 === undefined' }
 * ```
 */
export const emitMethodCall = <TStep extends EmitterMethodStep>({
  table,
  call,
  emitterName,
  schema,
  target,
  schemaTarget,
  compositeLocals,
}: EmitMethodCallArgs<TStep>): TStep | undefined => {
  const emitterMethod = Object.hasOwn(table, call.name) ? table[call.name] : undefined;
  if (emitterMethod === undefined) {
    throw new Error(`${emitterName} has no method to emit .${call.name}() with.`);
  }

  return emitterMethod({
    // Its Emitter is the one its Schema names, so it is the Schema subclass that Emitter's methods read.
    schema,
    target,
    schemaTarget,
    compositeLocals,
    args: readCallArguments(call),
  });
};
