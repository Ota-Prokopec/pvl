// The code a `StringSchema` compiles to, one static method per method of
// `StringSchema` it mirrors.
import { ISSUE_CODE, STRING_SCHEMA_ISSUE_MESSAGE, type IssueEditableProps } from '@pvl/schema';
import { emitIssue, js, type EmitTarget, type EmittedCheck } from './utils.js';

export class StringSchemaEmitter {
  /**
   * ```ts
   * StringSchemaEmitter._checkType({ value: 'field0', path })
   * // { failsWhen: 'typeof field0 !== "string"', issue: '{ code: "INVALID_TYPE", … }' }
   * ```
   */
  public static _checkType({ value, path }: EmitTarget): EmittedCheck {
    return {
      failsWhen: js`typeof ${value} !== "string"`,
      issue: emitIssue(ISSUE_CODE.INVALID_TYPE, STRING_SCHEMA_ISSUE_MESSAGE._checkType(), path),
    };
  }

  /** `.min(3)` → `field0.length < 3`, reporting `TOO_SMALL`. */
  public static min(
    { value, path }: EmitTarget,
    minLength: number,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value}.length < ${minLength}`,
      issue: emitIssue(
        ISSUE_CODE.TOO_SMALL,
        options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.min(minLength),
        path,
      ),
    };
  }

  /** `.max(20)` → `field0.length > 20`, reporting `TOO_BIG`. */
  public static max(
    { value, path }: EmitTarget,
    maxLength: number,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value}.length > ${maxLength}`,
      issue: emitIssue(
        ISSUE_CODE.TOO_BIG,
        options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.max(maxLength),
        path,
      ),
    };
  }

  /** `.length(2)` → `field0.length !== 2`, reporting `INVALID_LENGTH`. */
  public static length(
    { value, path }: EmitTarget,
    exactLength: number,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value}.length !== ${exactLength}`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_LENGTH,
        options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.length(exactLength),
        path,
      ),
    };
  }
}
