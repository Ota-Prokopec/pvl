import type { InferInput, InferOutput } from './types.js';
import { ArraySchema } from './schemas/arraySchema.js';
import type { ReadOnlySchema } from './schemas/schema.js';
import { BigintSchema } from './schemas/bigintSchema.js';
import { BooleanSchema } from './schemas/booleanSchema.js';
import { EnumSchema, type EnumSource } from './schemas/enumSchema.js';
import { LiteralSchema, type PossibleLiteralValue } from './schemas/literalSchema.js';
import { NumberSchema } from './schemas/numberSchema.js';
import { ObjectSchema, type ObjectShape } from './schemas/objectSchema.js';
import { StringSchema } from './schemas/stringSchema.js';
import { UnionSchema, type UnionMembers } from './schemas/unionSchema.js';

/**
 * The schema types `pvl.compile()` accepts — object and array schemas only,
 * with any modifier chained, `.transform()` included. Compiling a single
 * primitive has no tree to flatten, so a bare primitive like `pvl.string()`
 * is rejected at the type level rather than accepted and silently doing
 * nothing useful.
 *
 * @example
 * ```ts
 * import { pvl, type CompileCandidate } from '@pvl/schema';
 *
 * const candidate: CompileCandidate = pvl.object({ id: pvl.string() });
 * pvl.compile(candidate);
 * pvl.compile(pvl.array(pvl.string()).transform((tags) => tags.length));
 *
 * // @ts-expect-error a primitive has no tree to compile
 * pvl.compile(pvl.string());
 * ```
 */
// Told apart by the type-only `'~compileCandidate'` marker `ObjectSchema` and
// `ArraySchema` declare and `.transform()` carries over, since a transformed
// composite is a Read-only Schema like any other.
export type CompileCandidate = ReadOnlySchema<unknown, unknown> & {
  readonly '~compileCandidate': true;
};

/**
 * What `pvl.compile()` hands back: a {@link ReadOnlySchema}, plus the
 * read-only `shape` of an object schema or `element` of an array schema
 * when no `.transform()` was chained — a transformed value can be anything,
 * so it has neither.
 *
 * @example
 * ```ts
 * import { pvl, type CompiledSchema } from '@pvl/schema';
 *
 * const user = pvl.object({ name: pvl.string() });
 * const compiled: CompiledSchema<typeof user> = pvl.compile(user);
 *
 * compiled.shape.name.validate('Ada'); // { value: 'Ada' }
 * compiled.validate({ name: 'Ada' }); // { value: { name: 'Ada' } }
 * ```
 */
export type CompiledSchema<Candidate extends CompileCandidate> = ReadOnlySchema<
  InferInput<Candidate>,
  InferOutput<Candidate>
> &
  (Candidate extends { readonly shape: infer Shape }
    ? { readonly shape: Shape }
    : Candidate extends { readonly element: infer Element }
      ? { readonly element: Element }
      : unknown);

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
  array: <Item extends ReadOnlySchema<unknown, unknown>>(item: Item): ArraySchema<Item> =>
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
   * Marks a composite schema — an object or array schema — as a candidate for
   * ahead-of-time compilation by `@pvl/schema-compiler`. At runtime it is the
   * identity function, so a schema that uses it still validates normally
   * before the compiler has seen the call site.
   *
   * It hands back a {@link CompiledSchema}: no modifier can be chained onto
   * it, so chain every one before compiling — `pvl.compile(x.optional())`,
   * not `pvl.compile(x).optional()`. It can still be a field or element of
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
  // for what happens once a call site has been through the compiler). The
  // assertion only narrows the surface: `CompiledSchema` is a subset of what
  // `schema` already has, which a deferred conditional type can't show.
  compile: <Candidate extends CompileCandidate>(schema: Candidate): CompiledSchema<Candidate> =>
    schema as unknown as CompiledSchema<Candidate>,
};
