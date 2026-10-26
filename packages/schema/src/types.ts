// The package's standalone types: the inference helpers and the type plumbing
// behind the Modifiers (`InterpretedSchemaKind`, `RetypedSchema`, `PreModifiersResult`).
// It is in the barrel, so that plumbing is tagged `@internal`.
import type { ValueOfEnum } from '@repo/types';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Issue } from './issue/issue.js';
import type { ChainableInterpretedSchema } from './schemas/chainableInterpretedSchema.js';
import type { InterpretedSchema } from './schemas/interpretedSchema.js';
import type { Schema, StandaloneMarkerOf } from './schemas/schema.js';
import type { pvl } from './pvl.js';

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
 * declares a `'~kind'` extending `InterpretedSchemaKind<ItsOwnClass<…, unknown, unknown>>`
 * and overrides `type` with the subclass re-parameterized with
 * `this['Input']` and `this['Output']`, so a modifier that widens the types
 * still hands back that subclass. Type-only: nothing exists at runtime.
 *
 * @internal
 */
export type InterpretedSchemaKind<TSchema extends InterpretedSchema> = {
  readonly Input: unknown;
  readonly Output: unknown;
  readonly type: TSchema;
};

/**
 * `TSchema`'s own class re-typed with `Input` and `Output` through its
 * `'~kind'`, or the base `ChainableInterpretedSchema` for a class that declares none,
 * marked `.standalone()` when `TSchema` is.
 *
 * @internal
 */
// The class `'~kind'` rebuilds knows nothing of an intersection on `TSchema`,
// so the marker is carried over on its own (ADR-0036).
export type RetypedSchema<TSchema, Input, Output> = (TSchema extends {
  readonly '~kind': infer Kind extends InterpretedSchemaKind<ChainableInterpretedSchema>;
}
  ? (Kind & { readonly Input: Input; readonly Output: Output })['type']
  : ChainableInterpretedSchema<Input, Output>) &
  StandaloneMarkerOf<TSchema>;

// Distributes over a union, as `keyof` of a union keeps only the shared keys.
type MethodNameOf<TSchema> = TSchema extends unknown
  ? {
      [Key in keyof TSchema]: TSchema[Key] extends (...args: never[]) => unknown ? Key : never;
    }[keyof TSchema]
  : never;

// Distributes over a union, as `keyof` of a union keeps only the shared keys.
type KeyOf<TSchema> = TSchema extends unknown ? keyof TSchema : never;

/**
 * The name of every member on a schema some `pvl.*` factory builds: each
 * {@link PvlSchemaMethodName} and each property (`'element'`, `'shape'`),
 * leaving out the `_`- and `~`-prefixed internals.
 *
 * @internal
 */
export type PvlSchemaPropertyName = Exclude<
  KeyOf<ReturnType<ValueOfEnum<typeof pvl>>>,
  `_${string}` | `~${string}` | symbol
>;

/**
 * The name of every method on a schema some `pvl.*` factory builds
 * (`'min'`, `'optional'`, `'validate'`, …), leaving out the `_`-prefixed internals.
 *
 * @internal
 */
export type PvlSchemaMethodName = Exclude<
  MethodNameOf<ReturnType<ValueOfEnum<typeof pvl>>>,
  `_${string}`
>;

/**
 * Every {@link PvlSchemaMethodName} chained onto a schema (`'min'`, `'optional'`,
 * `'strict'`, …), leaving out the ones every {@link Schema} has (`'validate'`, `'standalone'`).
 *
 * @internal
 */
export type PvlSchemaModifierMethodName = Exclude<PvlSchemaMethodName, keyof Schema>;

/**
 * The name of every method on `pvl`: each {@link PvlFactoryName} and `'compile'`.
 *
 * @internal
 */
export type PvlObjectPropertyName = keyof typeof pvl;

/**
 * The name of every `pvl.*` factory a Schema is built from (`'string'`, `'object'`, …),
 * leaving out `'compile'`, which marks an existing Schema rather than building one.
 *
 * @example
 * ```ts
 * import { PVL_FACTORY_NAMES_ENUM, type PvlFactoryName } from '@pvl/schema';
 *
 * const factory: PvlFactoryName = PVL_FACTORY_NAMES_ENUM.STRING; // 'string'
 * ```
 */
export type PvlFactoryName = Exclude<PvlObjectPropertyName, 'compile'>;
