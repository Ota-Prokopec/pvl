// The code a `NumberSchema` compiles to, one static method per method of
// `NumberInterpretedSchema` it mirrors.
import {
  ISSUE_CODE,
  Issue,
  NUMBER_SCHEMA_ISSUE_MESSAGE,
  type NumberInterpretedSchema,
} from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitBaseCheckArgs } from './emitter.js';
import { emitConstraintIssue, emitDefaultMessage, emitIssue } from '../issue.js';
import type { EmittedCheck, EmitterMethodOf, ParameterTypesOf } from './emittersTypes.js';
import { ISSUE_OPTIONS_TYPE } from '../consts.js';
import { emitArgument, emitCheck, js } from './emitterUtils.js';

export class NumberSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly parameterTypes: ParameterTypesOf<NumberInterpretedSchema> = {
    min: ['number', ISSUE_OPTIONS_TYPE],
    max: ['number', ISSUE_OPTIONS_TYPE],
    int: [ISSUE_OPTIONS_TYPE],
  };

  /** `typeof field0 !== "number" || Number.isNaN(field0)`, reporting `INVALID_TYPE`. */
  public static override _emitBaseCheck({
    target: { value, issuePath },
  }: EmitBaseCheckArgs): EmittedCheck {
    return emitCheck({
      failsWhen: js`typeof ${value} !== "number" || Number.isNaN(${value})`,
      issue: emitIssue(
        new Issue(ISSUE_CODE.INVALID_TYPE, [issuePath], NUMBER_SCHEMA_ISSUE_MESSAGE._checkType()),
      ),
    });
  }

  /** `.min(0)` → `field0 < 0`, reporting `TOO_SMALL`. */
  public static readonly min: EmitterMethodOf<NumberInterpretedSchema['min']> = ({
    target: { value, issuePath },
    args: [minValue, options],
  }) =>
    emitCheck({
      failsWhen: js`${value} < ${emitArgument(minValue)}`,
      issue: emitConstraintIssue({
        code: ISSUE_CODE.TOO_SMALL,
        issuePath,
        options,
        defaultMessage: emitDefaultMessage(NUMBER_SCHEMA_ISSUE_MESSAGE.min, minValue),
      }),
    });

  /** `.max(9)` → `field0 > 9`, reporting `TOO_BIG`. */
  public static readonly max: EmitterMethodOf<NumberInterpretedSchema['max']> = ({
    target: { value, issuePath },
    args: [maxValue, options],
  }) =>
    emitCheck({
      failsWhen: js`${value} > ${emitArgument(maxValue)}`,
      issue: emitConstraintIssue({
        code: ISSUE_CODE.TOO_BIG,
        issuePath,
        options,
        defaultMessage: emitDefaultMessage(NUMBER_SCHEMA_ISSUE_MESSAGE.max, maxValue),
      }),
    });

  /** `.int()` → `!Number.isInteger(field0)`, reporting `NOT_INTEGER`. */
  public static readonly int: EmitterMethodOf<NumberInterpretedSchema['int']> = ({
    target: { value, issuePath },
    args: [options],
  }) =>
    emitCheck({
      failsWhen: js`!Number.isInteger(${value})`,
      issue: emitConstraintIssue({
        code: ISSUE_CODE.NOT_INTEGER,
        issuePath,
        options,
        defaultMessage: emitDefaultMessage(NUMBER_SCHEMA_ISSUE_MESSAGE.int),
      }),
    });
}
