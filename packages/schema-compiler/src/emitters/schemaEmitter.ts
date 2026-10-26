// The type of an Emitter a Schema subclass compiles with: `Emitter`'s
// static methods, plus the base check of its schema type.
import type { Schema } from '../schemas/schema.js';
import type { Emitter } from './emitter.js';
import type { CheckingTarget, EmittedCheck } from './types.js';

/** What {@link SchemaEmitter._emitBaseCheck} emits a type check for: a Schema at the target it checks. */
export type EmitBaseCheckArgs<TSchema extends Schema = Schema> = {
  schema: TSchema;
  target: CheckingTarget;
};

/**
 * An Emitter a Schema subclass compiles with (`Schema.emitter`): `Emitter`'s
 * static methods, plus the base check of its schema type, which every such
 * Emitter writes. TypeScript has no abstract static method, so this type
 * stands in for one: naming an Emitter without `_emitBaseCheck` as a
 * Schema subclass's, or emitting a Schema's parts with one, is a type
 * error.
 */
export type SchemaEmitter = typeof Emitter & {
  /**
   * The base check of `schema` at `target`: its type check, as a
   * statement, reading `schema` only when the check needs the factory's
   * argument (`pvl.literal('a')`).
   *
   * ```ts
   * StringSchemaEmitter._emitBaseCheck({ schema, target: { value: 'field0', path, issuePath } })
   * // 'if (typeof field0 !== "string") {\n  issues.push({ code: "INVALID_TYPE", … });\n}'
   * ```
   */
  // A method, not a function-typed property, so an Emitter's own may take
  // the Schema subclass it compiles (`EmitBaseCheckArgs<EnumSchema>`), as
  // an override of every other hook does.
  _emitBaseCheck(args: EmitBaseCheckArgs): EmittedCheck;
};
