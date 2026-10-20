/**
 * The `vendor` string every schema in this library reports through its
 * Standard Schema properties. Compiled Schemas produced by
 * `@pvl/schema-compiler` report the same value, so a consumer cannot tell
 * the two apart by vendor.
 *
 * @example
 * ```ts
 * import { pvl, VENDOR } from '@pvl/schema';
 *
 * const schema = pvl.string();
 * schema['~standard'].vendor === VENDOR; // true
 * ```
 */
export const VENDOR = '@pvl/schema' as const;

/**
 * The key of the brand every `@pvl/schema` Schema declares, which only this
 * library's own classes and a Compiled Schema carry.
 *
 * @internal
 */
// Type-only, so nothing is exported at runtime: import it with `import type`
// and use it only where TypeScript erases it, as the key of a `declare`d
// property. It keeps the `Schema` type nominal, so a Standard Schema
// from another library is never a field (ADR-0018, ADR-0029).
export declare const SCHEMA_BRAND: unique symbol;
