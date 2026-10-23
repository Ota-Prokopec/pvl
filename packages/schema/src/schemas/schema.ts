import type { SCHEMA_BRAND } from '../consts.js';
import type { Result } from '../result.js';
import type { StandardSchemaProps } from '../standardSchema.js';

/**
 * What every schema in this library is: something that validates a value.
 * A field of an object schema, an element of an array schema and a member
 * of a union are each typed as one, so any schema fits there. It is also
 * what `.transform()` and `pvl.compile()` hand back, since no modifier can be
 * chained onto either: chain constraints, `.optional()` and `.refine()`
 * first.
 *
 * `Input` is what a value must look like going in; `Output` is what a
 * successful `.validate()` hands back, which differs from `Input` once a
 * `.transform()` is attached.
 *
 * @example
 * ```ts
 * import { pvl, type Schema } from '@pvl/schema';
 *
 * const length: Schema<string, number> = pvl.string().transform((value) => value.length);
 *
 * length.validate('abc'); // { value: 3 }
 * pvl.object({ name: length }).validate({ name: 'Ada' }); // { value: { name: 3 } }
 * ```
 */
// A type a class implements, so a Compiled Schema implements it without
// extending the interpreted pipeline's class (ADR-0029); `InterpretedSchema`
// implements it for every schema a factory builds. `"~standard"` is the
// spec's `StandardSchemaV1.Props` narrowed, so every Schema is a
// `StandardSchemaV1`. The brand keeps it nominal, which is what keeps a
// Standard Schema from another library from being a field (ADR-0018).
export type Schema<Input = unknown, Output = Input> = {
  /** @internal */
  readonly [SCHEMA_BRAND]: true;

  /**
   * The Standard Schema protocol property. Consumers reach for
   * `.validate()`; this exists so any Standard Schema-aware tool can use a
   * `@pvl/schema` schema without knowing about this library.
   *
   * @internal
   */
  readonly '~standard': StandardSchemaProps<Input, Output>;

  /**
   * Checks a value against this schema and returns a {@link Result}
   * synchronously. It never throws for an invalid value — a rejection comes
   * back as `issues`, so the two branches are handled the same way every
   * time.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const result = pvl.number().int().validate(1.5);
   * if (result.issues) {
   *   console.log(result.issues[0]?.message); // 'Number must be an integer'
   * } else {
   *   console.log(result.value);
   * }
   * ```
   */
  validate(value: unknown): Result<Output>;

  /**
   * Validation with every Issue reported at `path`, which a composite schema
   * calls on each of its fields, elements or members, the parent's path
   * extended.
   *
   * @internal
   */
  // `Result<unknown>`, though its value is an `Output`: a Compiled Schema's
  // emitted checks build values TypeScript can't follow back to `Output`, so
  // its `validate` is the one place that casts. Its signature is part of the
  // compiler's contract (compile.md).
  _validate(value: unknown, path: ReadonlyArray<PropertyKey>): Result<unknown>;
};
