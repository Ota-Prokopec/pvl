// The per-primitive `.coerce()` conversions, shared by the primitive schemas
// and by `LiteralSchema` (whose literal pins it to exactly one of them). Each
// except `coerceToString` returns the input unchanged when it cannot convert,
// so the schema's own check is what ultimately rejects it — a coercion never
// produces an `Issue` of its own.

/**
 * The conversion `pvl.string().coerce()` applies before its own check: every
 * input becomes its `String()` form, so the string check always passes —
 * including for `undefined`, `null` and objects, which become `'undefined'`,
 * `'null'` and `'[object Object]'`. Chain `.optional()` or `.nullable()`
 * before `.coerce()` to keep `undefined` or `null` as they are.
 *
 * @example
 * ```ts
 * import { coerceToString } from '@pvl/schema';
 *
 * coerceToString(42); // '42'
 * coerceToString(true); // 'true'
 * coerceToString(undefined); // 'undefined'
 * ```
 */
// `String()` rather than a template literal: a template literal throws on a
// `Symbol`, and `.validate()` never throws for an invalid value.
export const coerceToString = (value: unknown): unknown => String(value);

/**
 * The conversion `pvl.number().coerce()` applies before its own check:
 * `string` and `boolean` inputs become their `Number()` form, and anything
 * else is handed through untouched. An unparseable string becomes `NaN`,
 * which the number check rejects.
 *
 * @example
 * ```ts
 * import { coerceToNumber } from '@pvl/schema';
 *
 * coerceToNumber('42'); // 42
 * coerceToNumber(true); // 1
 * coerceToNumber('abc'); // NaN — rejected by the number check
 * ```
 */
export const coerceToNumber = (value: unknown): unknown =>
  typeof value === 'string' || typeof value === 'boolean' ? Number(value) : value;

/**
 * The conversion `pvl.boolean().coerce()` applies before its own check:
 * `string`, `number` and `bigint` inputs become their `Boolean()` form. This
 * is JavaScript truthiness, so every non-empty string is `true` — including
 * `'false'`.
 *
 * @example
 * ```ts
 * import { coerceToBoolean } from '@pvl/schema';
 *
 * coerceToBoolean(1); // true
 * coerceToBoolean(''); // false
 * coerceToBoolean('false'); // true — a non-empty string is truthy
 * ```
 */
export const coerceToBoolean = (value: unknown): unknown =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
    ? Boolean(value)
    : value;

// `BigInt()` throws on a malformed string (`"12.5"`) or a non-integer number
// (`1.5`); that's caught here so the value falls through unchanged and fails
// the normal base-type check instead of propagating.
/**
 * The conversion `pvl.bigint().coerce()` applies before its own check:
 * `string` and `number` inputs go through native `BigInt()`. An input
 * `BigInt()` refuses — a malformed string, or a number with a fractional part
 * — is handed through untouched and rejected by the bigint check rather than
 * throwing.
 *
 * @example
 * ```ts
 * import { coerceToBigint } from '@pvl/schema';
 *
 * coerceToBigint('42'); // 42n
 * coerceToBigint(7); // 7n
 * coerceToBigint('12.5'); // '12.5' — unchanged, and so still not a bigint
 * ```
 */
export const coerceToBigint = (value: unknown): unknown => {
  if (typeof value === 'string' || typeof value === 'number') {
    try {
      return BigInt(value);
    } catch {
      return value;
    }
  }
  return value;
};
