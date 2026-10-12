// The code a `StringSchema` compiles to, one static method per method of
// `StringSchema` it mirrors.
import { ISSUE_CODE, STRING_SCHEMA_ISSUE_MESSAGE, type StringSchema } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitChecksArgs } from './emitter.js';
import type { EmitterMethodOf, EmittingCheckMethodOutputWithCheck } from './emitterTypes.js';
import { emitIssue, js } from './emitterUtils.js';

export class StringSchemaEmitter extends ChainableSchemaEmitter {
  /**
   * ```ts
   * StringSchemaEmitter._emitBaseCheck({ schema, target: { value: 'field0', issuePath }, scope })
   * // { failsWhen: 'typeof field0 !== "string"', issue: '{ code: "INVALID_TYPE", … }' }
   * ```
   */
  public static override _emitBaseCheck({
    target: { value, issuePath },
  }: EmitChecksArgs): EmittingCheckMethodOutputWithCheck {
    return {
      failsWhen: js`typeof ${value} !== "string"`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_TYPE,
        STRING_SCHEMA_ISSUE_MESSAGE._checkType(),
        issuePath,
      ),
    };
  }

  /** `.min(3)` → `field0.length < 3`, reporting `TOO_SMALL`. */
  public static readonly min: EmitterMethodOf<StringSchema['min']> = ({
    target: { value, issuePath },
    args: [minLength, options],
  }) => ({
    failsWhen: js`${value}.length < ${minLength}`,
    issue: emitIssue(
      ISSUE_CODE.TOO_SMALL,
      options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.min(minLength),
      issuePath,
    ),
  });

  /** `.max(20)` → `field0.length > 20`, reporting `TOO_BIG`. */
  public static readonly max: EmitterMethodOf<StringSchema['max']> = ({
    target: { value, issuePath },
    args: [maxLength, options],
  }) => ({
    failsWhen: js`${value}.length > ${maxLength}`,
    issue: emitIssue(
      ISSUE_CODE.TOO_BIG,
      options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.max(maxLength),
      issuePath,
    ),
  });

  /** `.length(2)` → `field0.length !== 2`, reporting `INVALID_LENGTH`. */
  public static readonly length: EmitterMethodOf<StringSchema['length']> = ({
    target: { value, issuePath },
    args: [exactLength, options],
  }) => ({
    failsWhen: js`${value}.length !== ${exactLength}`,
    issue: emitIssue(
      ISSUE_CODE.INVALID_LENGTH,
      options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.length(exactLength),
      issuePath,
    ),
  });
}
