// The code a `StringSchema` compiles to, one method per method of
// `StringInterpretedSchema` it mirrors, held in its `postModifierChecks` table.
import {
  ISSUE_CODE,
  Issue,
  STRING_SCHEMA_ISSUE_MESSAGE,
  type StringInterpretedSchema,
} from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitBaseCheckArgs } from './emitter.js';
import { emitConstraintIssue, emitDefaultMessage, emitIssue } from '../issue.js';
import type {
  ArgumentMessagesOf,
  EmittedCheck,
  EmitterMethodOf,
  ParameterTypesOf,
  PostModifierCheckTable,
} from './emittersTypes.js';
import { ISSUE_OPTIONS_TYPE } from '../consts.js';
import { emitArgument, emitCheck, js } from './emitterUtils.js';

/** `.min(3)` → `field0.length < 3`, reporting `TOO_SMALL`. */
const min: EmitterMethodOf<StringInterpretedSchema['min']> = ({
  target: { value, issuePath },
  args: [minLength, options],
}) =>
  emitCheck({
    failsWhen: js`${value}.length < ${emitArgument(minLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_SMALL,
      issuePath,
      options,
      defaultMessage: emitDefaultMessage(StringSchemaEmitter.argumentMessages.min, minLength),
    }),
  });

/** `.max(20)` → `field0.length > 20`, reporting `TOO_BIG`. */
const max: EmitterMethodOf<StringInterpretedSchema['max']> = ({
  target: { value, issuePath },
  args: [maxLength, options],
}) =>
  emitCheck({
    failsWhen: js`${value}.length > ${emitArgument(maxLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_BIG,
      issuePath,
      options,
      defaultMessage: emitDefaultMessage(StringSchemaEmitter.argumentMessages.max, maxLength),
    }),
  });

/** `.length(2)` → `field0.length !== 2`, reporting `INVALID_LENGTH`. */
const length: EmitterMethodOf<StringInterpretedSchema['length']> = ({
  target: { value, issuePath },
  args: [exactLength, options],
}) =>
  emitCheck({
    failsWhen: js`${value}.length !== ${emitArgument(exactLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.INVALID_LENGTH,
      issuePath,
      options,
      defaultMessage: emitDefaultMessage(StringSchemaEmitter.argumentMessages.length, exactLength),
    }),
  });

export class StringSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly postModifierChecks = {
    ...ChainableSchemaEmitter.postModifierChecks,
    min,
    max,
    length,
  } satisfies PostModifierCheckTable;

  public static override readonly parameterTypes: ParameterTypesOf<StringInterpretedSchema> = {
    min: ['number', ISSUE_OPTIONS_TYPE],
    max: ['number', ISSUE_OPTIONS_TYPE],
    length: ['number', ISSUE_OPTIONS_TYPE],
  };

  public static override readonly argumentMessages = {
    min: STRING_SCHEMA_ISSUE_MESSAGE.min,
    max: STRING_SCHEMA_ISSUE_MESSAGE.max,
    length: STRING_SCHEMA_ISSUE_MESSAGE.length,
  } satisfies ArgumentMessagesOf<StringInterpretedSchema>;

  /**
   * ```ts
   * StringSchemaEmitter._emitBaseCheck({ schema, target: { value: 'field0', path, issuePath } })
   * // 'if (typeof field0 !== "string") {\n  issues.push({ code: "INVALID_TYPE", … });\n}'
   * ```
   */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitCheck({
      failsWhen: js`typeof ${value} !== "string"`,
      issue: emitIssue(
        new Issue(ISSUE_CODE.INVALID_TYPE, [issuePath], STRING_SCHEMA_ISSUE_MESSAGE._checkType()),
      ),
    });
  }
}
