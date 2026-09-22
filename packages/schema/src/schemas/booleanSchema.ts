import { coerceToBoolean } from "../coercions.js";
import { buildIssue, ISSUE_CODE, type Result } from "../issue.js";
import { Schema, type SchemaOptions } from "./baseSchema.js";

export class BooleanSchema extends Schema<boolean, boolean> {
  private readonly _typeMessage: string;

  constructor(options?: SchemaOptions) {
    super();
    this._typeMessage = options?.message ?? "Expected boolean";
  }

  override _coerceInput(value: unknown): unknown {
    return coerceToBoolean(value);
  }

  _checkType(
    value: unknown,
    path: ReadonlyArray<PropertyKey>,
  ): Result<boolean> {
    if (typeof value !== "boolean") {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_TYPE, this._typeMessage, path)],
      };
    }
    return { value };
  }
}
