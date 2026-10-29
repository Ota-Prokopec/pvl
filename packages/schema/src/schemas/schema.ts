import type { SCHEMA_BRAND, STANDALONE_BRAND } from '../consts.js';
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
 * import { pvl, type Schema } from '@pcvl/schema';
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
// Standard Schema from another library from being a field (ADR-0018). An
// interface rather than a `type`, as `.standalone()`'s return type reads the
// polymorphic `this`, which only an interface or a class has (ADR-0036).
export interface Schema<Input = unknown, Output = Input> {
  /** @internal */
  readonly [SCHEMA_BRAND]: true;

  /**
   * Whether `.standalone()` marked this schema, which is what an object
   * reads to keep it in its `shape`.
   *
   * @internal
   */
  readonly _standalone: boolean;

  /**
   * The Standard Schema protocol property. Consumers reach for
   * `.validate()`; this exists so any Standard Schema-aware tool can use a
   * `@pcvl/schema` schema without knowing about this library.
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
   * import { pvl } from '@pcvl/schema';
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

  /**
   * Marks this schema as a Standalone Key: as a field of `pvl.object()`, it
   * is kept in that object's `shape`, so it can be validated on its own, and
   * once the object is compiled, `@pcvl/compiler` gives it a compiled
   * validator of its own. Validation is unchanged.
   *
   * The schema comes back as the same type it went in as, marked, so the
   * chain goes on: modifiers can follow it, and an object keeps its `shape`
   * and an array its `element`. It is valid on any schema, a field or not,
   * and calling it again changes nothing.
   *
   * @example
   * ```ts
   * import { pvl } from '@pcvl/schema';
   *
   * const user = pvl.object({
   *   email: pvl.string().standalone().min(3),
   *   age: pvl.number().int(),
   * });
   *
   * user.shape.email.validate('a@b.c'); // { value: 'a@b.c' }
   * // user.shape.age — a compile error: `age` isn't a Standalone Key
   * ```
   */
  standalone(): this & StandaloneMarker;
}

/**
 * The type-only marker `.standalone()` adds to a schema's type: an object
 * keeps a field carrying it in its `shape`.
 *
 * @example
 * ```ts
 * import { pvl, type StandaloneMarker } from '@pcvl/schema';
 *
 * const email = pvl.string().standalone();
 * const isMarked: typeof email extends StandaloneMarker ? true : false = true;
 * ```
 */
export type StandaloneMarker = {
  /** @internal */
  readonly [STANDALONE_BRAND]: true;
};

/**
 * {@link StandaloneMarker} when `TSchema` carries it, and nothing otherwise:
 * what a call handing back another schema type keeps of the marker, so
 * `.standalone()` can be chained anywhere.
 *
 * @internal
 */
export type StandaloneMarkerOf<TSchema> = TSchema extends StandaloneMarker
  ? StandaloneMarker
  : unknown;
