// The code a `BigintSchema` compiles to, one static method per method of
// `BigintSchema` it mirrors.
import { BIGINT_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, type IssueEditableProps } from '@pvl/schema';
import { emitIssue, emitLiteral, js, type EmitTarget, type EmittedCheck } from './utils.js';

export class BigintSchemaEmitter {
  /** `typeof field0 !== "bigint"`, reporting `INVALID_TYPE`. */
  public static _checkType({ value, path }: EmitTarget): EmittedCheck {
    return {
      failsWhen: js`typeof ${value} !== "bigint"`,
      issue: emitIssue(ISSUE_CODE.INVALID_TYPE, BIGINT_SCHEMA_ISSUE_MESSAGE._checkType(), path),
    };
  }

  /** `.min(0n)` → `field0 < 0n`, reporting `TOO_SMALL`. */
  public static min(
    { value, path }: EmitTarget,
    minValue: bigint,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value} < ${emitLiteral(minValue)}`,
      issue: emitIssue(
        ISSUE_CODE.TOO_SMALL,
        options?.message ?? BIGINT_SCHEMA_ISSUE_MESSAGE.min(minValue),
        path,
      ),
    };
  }

  /** `.max(9n)` → `field0 > 9n`, reporting `TOO_BIG`. */
  public static max(
    { value, path }: EmitTarget,
    maxValue: bigint,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value} > ${emitLiteral(maxValue)}`,
      issue: emitIssue(
        ISSUE_CODE.TOO_BIG,
        options?.message ?? BIGINT_SCHEMA_ISSUE_MESSAGE.max(maxValue),
        path,
      ),
    };
  }
}
