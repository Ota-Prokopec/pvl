// The code a `StringSchema` compiles to, one static method per method of
// `StringInterpretedSchema` it mirrors.
import {
  ISSUE_CODE,
  Issue,
  STRING_SCHEMA_ISSUE_MESSAGE,
  type StringInterpretedSchema,
} from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitBaseCheckArgs } from './emitter.js';
import { emitIssue } from '../issue.js';
import type { EmittedCheck, EmitterMethodOf } from './emittersTypes.js';
import { emitCheck, js } from './emitterUtils.js';

export class StringSchemaEmitter extends ChainableSchemaEmitter {
  /**
   * ```ts
   * StringSchemaEmitter._emitBaseCheck({ schema, target: { value: 'field0', issuePath }, scope })
   * // 'if (typeof field0 !== "string") {\n  issues.push({ code: "INVALID_TYPE", … });\n}'
   * ```
   */
  public static override _emitBaseCheck({
    target: { value, issuePath },
  }: EmitBaseCheckArgs): EmittedCheck {
    return emitCheck({
      failsWhen: js`typeof ${value} !== "string"`,
      issue: emitIssue(
        new Issue(ISSUE_CODE.INVALID_TYPE, [issuePath], STRING_SCHEMA_ISSUE_MESSAGE._checkType()),
      ),
    });
  }

  /** `.min(3)` → `field0.length < 3`, reporting `TOO_SMALL`. */
  public static readonly min: EmitterMethodOf<StringInterpretedSchema['min']> = ({
    target: { value, issuePath },
    args: [minLength, options],
  }) =>
    emitCheck({
      failsWhen: js`${value}.length < ${minLength}`,
      issue: emitIssue(
        new Issue(
          ISSUE_CODE.TOO_SMALL,
          [issuePath],
          options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.min(minLength),
        ),
      ),
    });

  /** `.max(20)` → `field0.length > 20`, reporting `TOO_BIG`. */
  public static readonly max: EmitterMethodOf<StringInterpretedSchema['max']> = ({
    target: { value, issuePath },
    args: [maxLength, options],
  }) =>
    emitCheck({
      failsWhen: js`${value}.length > ${maxLength}`,
      issue: emitIssue(
        new Issue(
          ISSUE_CODE.TOO_BIG,
          [issuePath],
          options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.max(maxLength),
        ),
      ),
    });

  /** `.length(2)` → `field0.length !== 2`, reporting `INVALID_LENGTH`. */
  public static readonly length: EmitterMethodOf<StringInterpretedSchema['length']> = ({
    target: { value, issuePath },
    args: [exactLength, options],
  }) =>
    emitCheck({
      failsWhen: js`${value}.length !== ${exactLength}`,
      issue: emitIssue(
        new Issue(
          ISSUE_CODE.INVALID_LENGTH,
          [issuePath],
          options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.length(exactLength),
        ),
      ),
    });
}
