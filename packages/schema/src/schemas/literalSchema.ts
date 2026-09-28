import { coerceToBigint, coerceToBoolean, coerceToNumber, coerceToString } from '../coercions.js';
import { buildIssue, formatIssueMessageValue, ISSUE_CODE } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

/**
 * Every primitive type `pvl.literal()` can pin a schema to. Objects, arrays
 * and `null`/`undefined` are not literal values — use `pvl.object()`,
 * `pvl.array()` or the `.nullable()`/`.optional()` modifiers instead.
 *
 * @example
 * ```ts
 * import { pvl, type LiteralValue } from '@pvl/schema';
 *
 * const pinned: LiteralValue = 'OWNER';
 * const owner = pvl.literal(pinned);
 * ```
 */
export type LiteralValue = string | number | boolean | bigint;

// The `.coerce()` conversion matching a literal's own type, resolved once at
// construction rather than re-dispatched on every `.validate()` call, since
// coercion sits on the validation hot path.
const coercionFor = (value: LiteralValue): ((value: unknown) => unknown) => {
  switch (typeof value) {
    case 'string':
      return coerceToString;
    case 'number':
      return coerceToNumber;
    case 'boolean':
      return coerceToBoolean;
    default:
      return coerceToBigint;
  }
};

/**
 * Matches exactly one constant value. Build one with `pvl.literal(value)`.
 * A right-shaped value of the wrong type (`'42'` for `pvl.literal(42)`) is
 * rejected just like a wrong value is.
 *
 * The comparison is `Object.is`, not `===`, which matters for the two values
 * they disagree about: `pvl.literal(0)` rejects `-0` rather than accepting it
 * and handing back `0`, and `pvl.literal(NaN)` matches `NaN` rather than
 * being a schema nothing can satisfy.
 *
 * @example
 * ```ts
 * import { pvl } from '@pvl/schema';
 *
 * const owner = pvl.literal('OWNER');
 *
 * owner.validate('OWNER'); // { value: 'OWNER' }
 * owner.validate('MEMBER'); // { issues: [{ code: 'INVALID_VALUE', ... }] }
 *
 * // Literals are how a union gets a discriminant:
 * const event = pvl.union([
 *   pvl.object({ type: pvl.literal('created'), id: pvl.string() }),
 *   pvl.object({ type: pvl.literal('deleted'), id: pvl.string() }),
 * ]);
 * ```
 */
export class LiteralSchema<Value extends LiteralValue> extends Schema<Value, Value> {
  private readonly _value: Value;
  private readonly _message: string;
  private readonly _coerce: (value: unknown) => unknown;

  /** @internal */
  constructor(value: Value, options?: SchemaOptions) {
    super();
    this._value = value;
    this._message = options?.message ?? `Expected ${formatIssueMessageValue(value)}`;
    this._coerce = coercionFor(value);
  }

  /**
   * A literal pins the schema to one primitive type, so `.coerce()` has an
   * unambiguous target: convert the input exactly as the matching primitive
   * schema would, then let the equality check decide. An unconvertible input
   * falls through unchanged and fails that check.
   *
   * @internal
   */
  override _coerceInput(value: unknown): unknown {
    return this._coerce(value);
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Value> {
    if (!Object.is(value, this._value)) {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_VALUE, this._message, path)],
      };
    }
    return { value: this._value };
  }
}
