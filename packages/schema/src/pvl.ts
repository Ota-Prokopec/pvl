import { ArraySchema } from './schemas/arraySchema.js';
import type { Schema } from './schemas/schema.js';
import { BigintSchema } from './schemas/bigintSchema.js';
import { BooleanSchema } from './schemas/booleanSchema.js';
import { EnumSchema, type EnumSource } from './schemas/enumSchema.js';
import { LiteralSchema, type PossibleLiteralValue } from './schemas/literalSchema.js';
import { NumberSchema } from './schemas/numberSchema.js';
import { ObjectSchema, type ObjectShape } from './schemas/objectSchema.js';
import { StringSchema } from './schemas/stringSchema.js';
import { UnionSchema, type UnionMembers } from './schemas/unionSchema.js';
import type { InferInput, InferOutput } from './types.js';

/**
 * The single entry point of `@pvl/schema`. Every schema factory hangs off
 * this object; from a schema, the modifiers and checks are chained methods.
 *
 * @example
 * ```ts
 * import { pvl } from '@pvl/schema';
 *
 * const user = pvl.object({
 *   name: pvl.string().min(1),
 *   role: pvl.enum(['OWNER', 'MEMBER']),
 *   nickname: pvl.string().optional(),
 * });
 *
 * const result = user.validate({ name: 'Ada', role: 'OWNER' });
 * ```
 */
export const pvl = {
  /**
   * A schema accepting a JavaScript `string`, with optional `.min()`,
   * `.max()` and `.length()` constraints.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * pvl.string().validate('hello'); // { value: 'hello' }
   * pvl.string().min(3).validate('hi'); // { issues: [{ code: 'TOO_SMALL', ... }] }
   * pvl.string().min(3, { message: 'too short' }).validate('hi'); // message: 'too short'
   * ```
   */
  string: (): StringSchema => new StringSchema(),

  /**
   * A schema accepting a JavaScript `number` — floats and integers alike,
   * with optional `.min()`, `.max()` and `.int()` constraints. `NaN` is
   * rejected; `Infinity` is not.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * pvl.number().validate(36); // { value: 36 }
   * pvl.number().int().min(0).validate(-1); // { issues: [{ code: 'TOO_SMALL', ... }] }
   * ```
   */
  number: (): NumberSchema => new NumberSchema(),

  /**
   * A schema accepting a JavaScript `boolean`. Use `pvl.literal(true)` when
   * only one of the two values will do.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * pvl.boolean().validate(false); // { value: false }
   * pvl.boolean().validate('false'); // { issues: [{ code: 'INVALID_TYPE', ... }] }
   * ```
   */
  boolean: (): BooleanSchema => new BooleanSchema(),

  /**
   * A schema accepting a real JavaScript `bigint`, with optional `.min()` and
   * `.max()` bounds — themselves `bigint`s. A `number` is never silently
   * accepted.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * pvl.bigint().validate(9007199254740993n); // { value: 9007199254740993n }
   * pvl.bigint().coerce().validate('42'); // { value: 42n }
   * ```
   */
  bigint: (): BigintSchema => new BigintSchema(),

  /**
   * A schema matching exactly one constant value, compared with `Object.is`.
   * Combine literals inside a union to model a tagged variant.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * pvl.literal('OWNER').validate('OWNER'); // { value: 'OWNER' }
   * pvl.literal(42).validate('42'); // { issues: [{ code: 'INVALID_VALUE', ... }] }
   * ```
   */
  literal: <Value extends PossibleLiteralValue>(value: Value): LiteralSchema<Value> =>
    new LiteralSchema(value),

  /**
   * A schema validating each declared key against its own field schema.
   * Unknown keys are stripped by default — chain `.strict()` to reject them
   * or `.passthrough()` to keep them. Every field is checked, so one `Result`
   * reports every failing field at once.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const user = pvl.object({ name: pvl.string(), age: pvl.number().int() });
   *
   * user.validate({ name: 'Ada', age: 36, extra: true });
   * // { value: { name: 'Ada', age: 36 } }
   * ```
   */
  object: <Shape extends ObjectShape>(shape: Shape): ObjectSchema<Shape> => new ObjectSchema(shape),

  /**
   * A schema validating every element against one shared item schema, with
   * optional `.min()`, `.max()` and `.length()` constraints on the array
   * itself. Every element is checked, each failure pathed with its index.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const tags = pvl.array(pvl.string()).min(1);
   *
   * tags.validate(['a', 2]); // { issues: [{ path: [1], code: 'INVALID_TYPE', ... }] }
   * ```
   */
  array: <Item extends Schema<unknown, unknown>>(item: Item): ArraySchema<Item> =>
    new ArraySchema(item),

  /**
   * A schema accepting one of a fixed set of values, from either an `as
   * const` enum object or an array of string literals.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const SYSTEM_ROLE = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const;
   *
   * pvl.enum(SYSTEM_ROLE).validate('OWNER'); // { value: 'OWNER' }
   * pvl.enum(['small', 'large']).validate('medium'); // { issues: [...] }
   * ```
   */
  // `const Source` so a bare `pvl.enum(["A", "B"])` call site infers the
  // readonly tuple of literals rather than widening to `string[]`.
  enum: <const Source extends EnumSource>(source: Source): EnumSchema<Source> =>
    new EnumSchema(source),

  /**
   * A schema trying each member in the order given and succeeding on the
   * first that accepts the value. A total failure reports one
   * `INVALID_UNION` issue followed by every member's own rejection.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const id = pvl.union([pvl.string(), pvl.number().int()]);
   *
   * id.validate(7); // { value: 7 }
   * id.validate(true); // { issues: [...] } — INVALID_UNION, then each member's rejection
   * ```
   */
  // `const Members` so a bare `pvl.union([...])` call site infers the
  // readonly tuple of member schemas rather than widening to their union.
  union: <const Members extends UnionMembers>(members: Members): UnionSchema<Members> =>
    new UnionSchema(members),

  /**
   * Marks a schema — any schema, primitive or composite, transformed or not —
   * for ahead-of-time compilation by `@pvl/schema-compiler`. At runtime it is the
   * identity function, so a schema that uses it still validates normally
   * before the compiler has seen the call site.
   *
   * It hands back a plain {@link Schema}: no modifier can be chained onto it
   * and no `shape` or `element` can be read from it, so chain every modifier
   * before compiling — `pvl.compile(x.optional())`, not
   * `pvl.compile(x).optional()` — and keep a reference to any field schema
   * you want to validate on its own. It can still be a field or element of
   * another schema.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const payload = pvl.compile(
   *   pvl.object({ id: pvl.string(), tags: pvl.array(pvl.string()) }),
   * );
   *
   * payload.validate({ id: 'a1', tags: [] }); // works today, compiled later
   * ```
   */
  // Identity function pre-compilation (see @pvl/schema-compiler's AGENTS.md
  // for what happens once a call site has been through the compiler, and
  // ADR-0020 for why it hands back a plain Schema). The assertion only
  // narrows the surface, which a deferred conditional type can't show.
  compile: <TSchema extends Schema<unknown, unknown>>(
    schema: TSchema,
  ): Schema<InferInput<TSchema>, InferOutput<TSchema>> =>
    schema as unknown as Schema<InferInput<TSchema>, InferOutput<TSchema>>,
};
