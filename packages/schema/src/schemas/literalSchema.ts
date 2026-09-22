import { buildIssue, ISSUE_CODE, type Result } from "../issue.js";
import { Schema, type SchemaOptions } from "./baseSchema.js";

/** Every primitive type `pvl.literal()` can pin a schema to. */
export type LiteralValue = string | number | boolean | bigint;

/**
 * Renders a literal for the default `Issue` message. `JSON.stringify` is
 * avoided because it throws on `bigint`.
 */
const formatLiteral = (value: LiteralValue): string =>
  typeof value === "string" ? `"${value}"` : String(value);

/**
 * Matches exactly one constant value. The check is a strict equality
 * comparison against the literal, so a right-shaped value of the wrong type
 * (`"42"` for `pvl.literal(42)`) is rejected just like a wrong value is.
 */
export class LiteralSchema<Value extends LiteralValue> extends Schema<
  Value,
  Value
> {
  private readonly _value: Value;
  private readonly _message: string;

  constructor(value: Value, options?: SchemaOptions) {
    super();
    this._value = value;
    this._message = options?.message ?? `Expected ${formatLiteral(value)}`;
  }

  /**
   * A literal pins the schema to one primitive type, so `.coerce()` has an
   * unambiguous target: convert the input the same way the matching primitive
   * schema would, then let the equality check below decide. A conversion that
   * `BigInt()` rejects falls through unchanged and fails that check.
   */
  override _coerceInput(value: unknown): unknown {
    switch (typeof this._value) {
      case "string":
        return typeof value === "number" ||
          typeof value === "boolean" ||
          typeof value === "bigint"
          ? String(value)
          : value;
      case "number":
        return typeof value === "string" || typeof value === "boolean"
          ? Number(value)
          : value;
      case "boolean":
        return typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "bigint"
          ? Boolean(value)
          : value;
      default:
        if (typeof value === "string" || typeof value === "number") {
          try {
            return BigInt(value);
          } catch {
            return value;
          }
        }
        return value;
    }
  }

  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Value> {
    if (value !== this._value) {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_VALUE, this._message, path)],
      };
    }
    return { value: this._value };
  }
}
