/**
 * The `vendor` string every schema in this library reports through its
 * Standard Schema properties. Compiled validators produced by
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
export const VENDOR = '@pvl/schema';
