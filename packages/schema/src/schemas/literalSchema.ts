import { coerceToBigint, coerceToBoolean, coerceToNumber, coerceToString } from '../coercions.js';
import { buildIssue, formatIssueMessageValue, ISSUE_CODE } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

/** Every primitive type `pvl.literal()` can pin a schema to. */
export type LiteralValue = string | number | boolean | bigint;

/**
 * The `.coerce()` conversion matching a literal's own type. Resolved once at
 * construction rather than re-dispatched on every `.validate()` call, since
 * coercion sits on the validation hot path.
 */
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
 * Matches exactly one constant value. The comparison is `Object.is`, not
 * `===`, so "exactly" holds for the two values the two disagree about:
 * `pvl.literal(0)` rejects `-0` instead of accepting it and silently handing
 * back `0`, and `pvl.literal(NaN)` matches `NaN` instead of being a schema
 * that can never accept anything. A right-shaped value of the wrong type
 * (`"42"` for `pvl.literal(42)`) is rejected just like a wrong value is.
 */
export class LiteralSchema<Value extends LiteralValue> extends Schema<Value, Value> {
  private readonly _value: Value;
  private readonly _message: string;
  private readonly _coerce: (value: unknown) => unknown;

  constructor(value: Value, options?: SchemaOptions) {
    super();
    this._value = value;
    this._message = options?.message ?? `Expected ${formatIssueMessageValue(value)}`;
    this._coerce = coercionFor(value);
  }

  /**
   * A literal pins the schema to one primitive type, so `.coerce()` has an
   * unambiguous target: convert the input exactly as the matching primitive
   * schema would, then let the comparison below decide. An unconvertible
   * input falls through unchanged and fails that comparison.
   */
  override _coerceInput(value: unknown): unknown {
    return this._coerce(value);
  }

  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Value> {
    if (!Object.is(value, this._value)) {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_VALUE, this._message, path)],
      };
    }
    return { value: this._value };
  }
}
