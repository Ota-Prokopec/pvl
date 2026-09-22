/**
 * The per-primitive `.coerce()` conversions, shared by the primitive schemas
 * and by `LiteralSchema` (whose literal pins it to exactly one of them).
 * Each returns the input unchanged when it can't convert, so the schema's own
 * check is what ultimately rejects it — a coercion never produces an `Issue`
 * of its own.
 */

export const coerceToString = (value: unknown): unknown =>
  typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
    ? String(value)
    : value

export const coerceToNumber = (value: unknown): unknown =>
  typeof value === 'string' || typeof value === 'boolean' ? Number(value) : value

export const coerceToBoolean = (value: unknown): unknown =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
    ? Boolean(value)
    : value

/**
 * `BigInt()` throws on a malformed string (`"12.5"`) or a non-integer number
 * (`1.5`); that's caught here so the value falls through unchanged and fails
 * the normal base-type check instead of propagating.
 */
export const coerceToBigint = (value: unknown): unknown => {
  if (typeof value === 'string' || typeof value === 'number') {
    try {
      return BigInt(value)
    } catch {
      return value
    }
  }
  return value
}
