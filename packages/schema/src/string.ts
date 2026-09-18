import { ISSUE_CODE, type IssueCode } from "./issue-code.js";
import {
  buildIssue,
  Schema,
  type Result,
  type SchemaOptions,
} from "./schema.js";

type StringCheck = {
  readonly code: IssueCode;
  readonly message: string;
  readonly test: (value: string) => boolean;
};

export class StringSchema extends Schema<string, string> {
  private readonly _typeMessage: string;
  private readonly _checks: ReadonlyArray<StringCheck>;

  constructor(
    options?: SchemaOptions,
    checks: ReadonlyArray<StringCheck> = [],
  ) {
    super();
    this._typeMessage = options?.message ?? "Expected string";
    this._checks = checks;
  }

  min(length: number, options?: SchemaOptions): StringSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_SMALL,
      message:
        options?.message ??
        `String must contain at least ${length} character(s)`,
      test: (value) => value.length >= length,
    });
  }

  max(length: number, options?: SchemaOptions): StringSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_BIG,
      message:
        options?.message ??
        `String must contain at most ${length} character(s)`,
      test: (value) => value.length <= length,
    });
  }

  length(length: number, options?: SchemaOptions): StringSchema {
    return this._withCheck({
      code: ISSUE_CODE.INVALID_LENGTH,
      message:
        options?.message ??
        `String must contain exactly ${length} character(s)`,
      test: (value) => value.length === length,
    });
  }

  override _coerceInput(value: unknown): unknown {
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      return String(value);
    }
    return value;
  }

  _validate(value: unknown, path: ReadonlyArray<PropertyKey>): Result<string> {
    if (typeof value !== "string") {
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

  private _withCheck(check: StringCheck): StringSchema {
    return new StringSchema({ message: this._typeMessage }, [
      ...this._checks,
      check,
    ]);
  }
}
