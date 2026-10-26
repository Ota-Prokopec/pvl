// How a chained method is dispatched to the emitter method of its name
// (ADR-0033): its arguments as that method takes them, and the method
// looked up in the table of the kind of text it writes.
import type { SchemaModifierCall } from '../../schemas/schemaTypes.js';
import type { EmittedMethodText } from '../types/emittedText.js';
import type { EmitterMethodTable } from '../types/methodTables.js';
import type { CheckingTarget } from '../types/schemaParts.js';

/**
 * `call`'s arguments, as the emitter method of its name takes them. The
 * compiler reads syntax, not types (ADR-0024), so it trusts them to be what
 * that method's parameters declare, as the application's own type check
 * holds them to be: typed `never`, they can be passed as any method's
 * `args`. The one place a call's arguments are handed to an emitter method. Only called on a
 * Schema `Schema.findUncompilableDiagnostics` found nothing in, so none is
 * spread.
 *
 * ```ts
 * readCallArguments(<.min(3, { message: 'short' })>) // [3, { message: 'short' }]
 * readCallArguments(<.optional()>)                  // []
 * ```
 */
export const readCallArguments = (call: SchemaModifierCall): never => {
  return (call.args ?? []) as never;
};

/** What {@link emitMethodCall} emits a chained method with: the table of the kind of text it writes, the call, the target it reads, and the name of the emitter dispatching it. */
type EmitMethodCallArgs<TOutput extends EmittedMethodText> = {
  table: EmitterMethodTable<TOutput>;
  call: SchemaModifierCall;
  target: CheckingTarget;
  /** Names the emitter in the error thrown when `table` has no method for `call`. */
  emitterName: string;
};

/**
 * What `call` compiles to, written at `target` by the method of its name
 * in `table`, which holds the methods writing one kind of text: a check
 * such as `.min(3)`'s, or a short-circuit condition such as
 * `.optional()`'s. Typed by the table, so what it writes needs no cast.
 * Only called on a Schema `Schema.findUncompilableDiagnostics` found
 * nothing in, so the method and its arguments are there. Throws when
 * `table` has no method of its name, which is a bug in an emitter, never
 * a user error.
 *
 * ```ts
 * emitMethodCall({ table: StringSchemaEmitter.shortCircuitConditions, call: <.optional()>, target: { value: 'field0', path, issuePath }, emitterName: 'StringSchemaEmitter' }) // 'field0 === undefined'
 * ```
 */
export const emitMethodCall = <TOutput extends EmittedMethodText>({
  table,
  call,
  target,
  emitterName,
}: EmitMethodCallArgs<TOutput>): TOutput => {
  const emitterMethod = Object.hasOwn(table, call.name) ? table[call.name] : undefined;
  if (emitterMethod === undefined) {
    throw new Error(`${emitterName} has no method to emit .${call.name}() with.`);
  }

  return emitterMethod({ target, args: readCallArguments(call) });
};
