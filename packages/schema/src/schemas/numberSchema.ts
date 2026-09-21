import {
  buildIssue,
  ISSUE_CODE,
  type IssueCode,
  type Result,
} from "../issue.js";
import { Schema, type SchemaOptions } from "./baseSchema.js";

type NumberCheck = {
  readonly code: IssueCode;
  readonly message: string;
  readonly test: (value: number) => boolean;
};

export class NumberSchema extends Schema<number, number> {
  private readonly _typeMessage: string;
  private readonly _checks: ReadonlyArray<NumberCheck>;

  constructor(
    options?: SchemaOptions,
    checks: ReadonlyArray<NumberCheck> = [],
  ) {
    super();
    this._typeMessage = options?.message ?? "Expected number";
    this._checks = checks;
  }

  min(value: number, options?: SchemaOptions): NumberSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_SMALL,
      message:
        options?.message ?? `Number must be greater than or equal to ${value}`,
      test: (current) => current >= value,
    });
  }

  max(value: number, options?: SchemaOptions): NumberSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_BIG,
      message:
        options?.message ?? `Number must be less than or equal to ${value}`,
      test: (current) => current <= value,
    });
  }

  int(options?: SchemaOptions): NumberSchema {
    return this._withCheck({
      code: ISSUE_CODE.NOT_INTEGER,
      message: options?.message ?? "Number must be an integer",
      test: (current) => Number.isInteger(current),
    });
  }

  override _coerceInput(value: unknown): unknown {
    if (typeof value === "string" || typeof value === "boolean") {
      return Number(value);
    }
    return value;
  }

  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<number> {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_TYPE, this._typeMessage, path)],
      };
    }
    for (const check of this._checks) {
      if (!check.test(value)) {
        return { issues: [buildIssue(check.code, check.message, path)] };
      }
    }
    return { value };
  }

  private _withCheck(check: NumberCheck): NumberSchema {
    return new NumberSchema({ message: this._typeMessage }, [
      ...this._checks,
      check,
    ]);
  }
}
