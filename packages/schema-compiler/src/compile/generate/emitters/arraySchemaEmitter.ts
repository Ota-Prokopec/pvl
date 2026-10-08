// The code an `ArraySchema` compiles to, one static method per method of
// `ArraySchema` it mirrors. The element loop itself is written by
// emitCompiledSchema.ts, which inlines the element's checks into it.
import { ARRAY_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, type IssueEditableProps } from '@pvl/schema';
import { emitIssue, js, type EmitTarget, type EmittedCheck } from './utils.js';

export class ArraySchemaEmitter {
  /** `!Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static _checkType({ value, path }: EmitTarget): EmittedCheck {
    return {
      failsWhen: js`!Array.isArray(${value})`,
      issue: emitIssue(ISSUE_CODE.INVALID_TYPE, ARRAY_SCHEMA_ISSUE_MESSAGE._checkType(), path),
    };
  }

  /** `.min(1)` → `value.length < 1`, reporting `TOO_SMALL`. */
  public static min(
    { value, path }: EmitTarget,
    minLength: number,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value}.length < ${minLength}`,
      issue: emitIssue(
        ISSUE_CODE.TOO_SMALL,
        options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.min(minLength),
        path,
      ),
    };
  }

  /** `.max(10)` → `value.length > 10`, reporting `TOO_BIG`. */
  public static max(
    { value, path }: EmitTarget,
    maxLength: number,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value}.length > ${maxLength}`,
      issue: emitIssue(
        ISSUE_CODE.TOO_BIG,
        options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.max(maxLength),
        path,
      ),
    };
  }

  /** `.length(3)` → `value.length !== 3`, reporting `INVALID_LENGTH`. */
  public static length(
    { value, path }: EmitTarget,
    exactLength: number,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value}.length !== ${exactLength}`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_LENGTH,
        options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.length(exactLength),
        path,
      ),
    };
  }
}
