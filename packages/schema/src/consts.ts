import {
  PVL_OBJECT_PROPERTY_NAMES_ENUM,
  PVL_SCHEMA_METHOD_NAME_ENUM,
  PVL_SCHEMA_PRE_MODIFIER_METHOD_NAMES_ENUM,
  PVL_SCHEMA_UNKNOWN_KEYS_METHOD_NAMES_ENUM,
} from './enums.js';

/**
 * The `vendor` string every schema in this library reports through its
 * Standard Schema properties. Compiled Schemas produced by
 * `@pcvl/compiler` report the same value, so a consumer cannot tell
 * the two apart by vendor.
 *
 * @example
 * ```ts
 * import { pvl, VENDOR } from '@pcvl/schema';
 *
 * const schema = pvl.string();
 * schema['~standard'].vendor === VENDOR; // true
 * ```
 */
export const VENDOR = '@pcvl/schema' as const;

/**
 * The key of the brand every `@pcvl/schema` Schema declares, which only this
 * library's own classes and a Compiled Schema carry.
 *
 * @internal
 */
// Type-only, so nothing is exported at runtime: import it with `import type`
// and use it only where TypeScript erases it, as the key of a `declare`d
// property. It keeps the `Schema` type nominal, so a Standard Schema
// from another library is never a field (ADR-0018, ADR-0029).
export declare const SCHEMA_BRAND: unique symbol;

/**
 * The key of the type-only marker `.standalone()` adds to a Schema's type,
 * which an object reads to keep a field in its `shape`.
 *
 * @internal
 */
// Type-only, like `SCHEMA_BRAND`: the marker exists at the type level alone,
// and the runtime reads the Schema's `_standalone` flag instead.
export declare const STANDALONE_BRAND: unique symbol;

/**
 * Every method of `pvl`, its factories and `compile`, as a name read from
 * source is checked against.
 *
 * @internal
 */
export const PVL_OBJECT_PROPERTY_NAMES: ReadonlySet<string> = new Set(
  Object.values(PVL_OBJECT_PROPERTY_NAMES_ENUM),
);

/**
 * Every method of a Schema some `pvl.*` factory builds, Modifiers,
 * `validate` and `standalone` included, as a name read from source is
 * checked against.
 *
 * @internal
 */
export const PVL_SCHEMA_METHOD_NAMES: ReadonlySet<string> = new Set(
  Object.values(PVL_SCHEMA_METHOD_NAME_ENUM),
);

/**
 * The methods added as pre-modifiers, which run before the type check.
 *
 * @internal
 */
// ADR-0010.
export const PVL_SCHEMA_PRE_MODIFIER_METHOD_NAMES: ReadonlySet<string> = new Set(
  Object.values(PVL_SCHEMA_PRE_MODIFIER_METHOD_NAMES_ENUM),
);

/**
 * The methods setting how an object treats the keys its shape doesn't
 * declare, the last of them chained winning.
 *
 * @internal
 */
// ADR-0007.
export const PVL_SCHEMA_UNKNOWN_KEYS_METHOD_NAMES: ReadonlySet<string> = new Set(
  Object.values(PVL_SCHEMA_UNKNOWN_KEYS_METHOD_NAMES_ENUM),
);
