import { coerceToBigint } from "../coercions.js";
import {
  buildIssue,
  ISSUE_CODE,
  type IssueCode,
  type Result,
} from "../issue.js";
import { Schema, type SchemaOptions } from "./baseSchema.js";

type BigintCheck = {
  readonly code: IssueCode;
  readonly message: string;
  readonly test: (value: bigint) => boolean;
};

export class BigintSchema extends Schema<bigint, bigint> {
  private readonly _typeMessage: string;
  private readonly _checks: ReadonlyArray<BigintCheck>;

  constructor(
    options?: SchemaOptions,
    checks: ReadonlyArray<BigintCheck> = [],
  ) {
    super();
    this._typeMessage = options?.message ?? "Expected bigint";
    this._checks = checks;
  }

  min(bound: bigint, options?: SchemaOptions): BigintSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_SMALL,
      message:
        options?.message ?? `Bigint must be greater than or equal to ${bound}`,
      test: (current) => current >= bound,
    });
  }

  max(bound: bigint, options?: SchemaOptions): BigintSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_BIG,
      message:
        options?.message ?? `Bigint must be less than or equal to ${bound}`,
      test: (current) => current <= bound,
    });
  }

  override _coerceInput(value: unknown): unknown {
    return coerceToBigint(value);
  }

  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<bigint> {
    if (typeof value !== "bigint") {
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

  private _withCheck(check: BigintCheck): BigintSchema {
    return new BigintSchema({ message: this._typeMessage }, [
      ...this._checks,
      check,
    ]);
  }
}
