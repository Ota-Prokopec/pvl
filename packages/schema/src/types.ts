import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Issue } from './issue.js';
import type { ChainableSchema } from './schemas/chainableSchema.js';

/**
 * The type a schema accepts as input — what a value must look like going in.
 *
 * @example
 * ```ts
 * import { pvl, type InferInput } from '@pvl/schema';
 *
 * const port = pvl.number().coerce();
 * type PortInput = InferInput<typeof port>; // unknown — `.coerce()` accepts anything
 * ```
 */
export type InferInput<TSchema extends StandardSchemaV1> = StandardSchemaV1.InferInput<TSchema>;

/**
 * The type a successful `.validate()` hands back.
 *
 * @example
 * ```ts
 * import { pvl, type InferOutput } from '@pvl/schema';
 *
 * const user = pvl.object({ name: pvl.string(), nickname: pvl.string().optional() });
 * type User = InferOutput<typeof user>; // { name: string; nickname?: string | undefined }
 * ```
 */
export type InferOutput<TSchema extends StandardSchemaV1> = StandardSchemaV1.InferOutput<TSchema>;

/**
 * What the pre-modifiers hand on to `_checkType` and the post-modifiers: the
 * current value, every Issue collected so far, and whether a `SHORT_CIRCUIT`
 * step accepted the value.
 *
 * @internal
 */
export type PreModifiersResult = {
  readonly value: unknown;
  readonly issues: ReadonlyArray<Issue>;
  readonly shortCircuited: boolean;
};

/**
 * How a schema class is rebuilt with new `Input`/`Output` types. A subclass
 * declares a `'~kind'` extending `SchemaKind<ItsOwnClass<…, unknown, unknown>>`
 * and overrides `type` with the subclass re-parameterized with
 * `this['Input']` and `this['Output']`, so a modifier that widens the types
 * still hands back that subclass. Type-only: nothing exists at runtime.
 *
 * @internal
 */
export interface SchemaKind<TSchema extends ChainableSchema> {
  readonly Input: unknown;
  readonly Output: unknown;
  readonly type: TSchema;
}

/**
 * `TSchema`'s own class re-typed with `Input` and `Output` through its
 * `'~kind'`, or the base `ChainableSchema` for a class that declares none.
 *
 * @internal
 */
export type RetypedSchema<TSchema, Input, Output> = TSchema extends {
  readonly '~kind': infer Kind extends SchemaKind<ChainableSchema>;
}
  ? (Kind & { readonly Input: Input; readonly Output: Output })['type']
  : ChainableSchema<Input, Output>;
