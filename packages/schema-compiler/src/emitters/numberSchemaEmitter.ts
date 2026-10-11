// The code a `NumberSchema` compiles to, one static method per method of
// `NumberSchema` it mirrors.
import { ISSUE_CODE, NUMBER_SCHEMA_ISSUE_MESSAGE, type IssueEditableProps } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { emitIssue, emitLiteral, js, type EmitTarget, type EmittedCheck } from './utils.js';

export class NumberSchemaEmitter extends ChainableSchemaEmitter {
  /** `typeof field0 !== "number" || Number.isNaN(field0)`, reporting `INVALID_TYPE`. */
  public static override _checkType({ value, path }: EmitTarget): EmittedCheck {
    return {
      failsWhen: js`typeof ${value} !== "number" || Number.isNaN(${value})`,
      issue: emitIssue(ISSUE_CODE.INVALID_TYPE, NUMBER_SCHEMA_ISSUE_MESSAGE._checkType(), path),
    };
  }

  /** `.min(0)` → `field0 < 0`, reporting `TOO_SMALL`. */
  public static min(
    { value, path }: EmitTarget,
    minValue: number,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value} < ${emitLiteral(minValue)}`,
      issue: emitIssue(
        ISSUE_CODE.TOO_SMALL,
        options?.message ?? NUMBER_SCHEMA_ISSUE_MESSAGE.min(minValue),
        path,
      ),
    };
  }

  /** `.max(9)` → `field0 > 9`, reporting `TOO_BIG`. */
  public static max(
    { value, path }: EmitTarget,
    maxValue: number,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value} > ${emitLiteral(maxValue)}`,
      issue: emitIssue(
        ISSUE_CODE.TOO_BIG,
        options?.message ?? NUMBER_SCHEMA_ISSUE_MESSAGE.max(maxValue),
        path,
      ),
    };
  }

  /** `.int()` → `!Number.isInteger(field0)`, reporting `NOT_INTEGER`. */
  public static int({ value, path }: EmitTarget, options?: IssueEditableProps): EmittedCheck {
    return {
      failsWhen: js`!Number.isInteger(${value})`,
      issue: emitIssue(
        ISSUE_CODE.NOT_INTEGER,
        options?.message ?? NUMBER_SCHEMA_ISSUE_MESSAGE.int(),
        path,
      ),
    };
  }
}
