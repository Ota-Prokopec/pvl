// The code a `NumberSchema` compiles to, one method per method of
// `NumberInterpretedSchema` it mirrors: its Constraints, held in its
// `postModifierChecks` table, and `.coerce()`, written by its `_emitCoercion`
// hook.
import { ISSUE_CODE, NUMBER_SCHEMA_ISSUE_MESSAGE, type NumberInterpretedSchema } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { emitCoerceToNumber } from './coercions.js';
import type { EmitBaseCheckArgs, EmitCoercionHookArgs } from './emitter.js';
import { emitConstraintIssue, emitDefaultMessage } from '../issue.js';
import type {
  ArgumentMessagesOf,
  EmittedCheck,
  EmittedCoercion,
  EmitterMethodOf,
  ParameterTypesOf,
  PostModifierCheckTable,
} from './types.js';
import { ISSUE_OPTIONS_TYPE } from '../consts.js';
import { emitArgument, emitCheck, js } from './emitterUtils.js';

/** `.min(0)` → `field0 < 0`, reporting `TOO_SMALL`. */
const min: EmitterMethodOf<NumberInterpretedSchema['min']> = ({
  target: { value, issuePath },
  args: [minValue, options],
}) =>
  emitCheck({
    failsWhen: js`${value} < ${emitArgument(minValue)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_SMALL,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(NumberSchemaEmitter.argumentMessages.min, minValue),
    }),
  });

/** `.max(9)` → `field0 > 9`, reporting `TOO_BIG`. */
const max: EmitterMethodOf<NumberInterpretedSchema['max']> = ({
  target: { value, issuePath },
  args: [maxValue, options],
}) =>
  emitCheck({
    failsWhen: js`${value} > ${emitArgument(maxValue)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_BIG,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(NumberSchemaEmitter.argumentMessages.max, maxValue),
    }),
  });

/** `.int()` → `!Number.isInteger(field0)`, reporting `NOT_INTEGER`. */
const int: EmitterMethodOf<NumberInterpretedSchema['int']> = ({
  target: { value, issuePath },
  args: [options],
}) =>
  emitCheck({
    failsWhen: js`!Number.isInteger(${value})`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.NOT_INTEGER,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(NUMBER_SCHEMA_ISSUE_MESSAGE.int),
    }),
  });

export class NumberSchemaEmitter extends ChainableSchemaEmitter {
  /** `.coerce()` → `field0 = Number(field0)` for a string or a boolean, as `coerceToNumber` converts. */
  public static override _emitCoercion({ value }: EmitCoercionHookArgs): EmittedCoercion {
    return emitCoerceToNumber(value);
  }

  public static override readonly postModifierChecks = {
    ...ChainableSchemaEmitter.postModifierChecks,
    min,
    max,
    int,
  } satisfies PostModifierCheckTable;

  public static override readonly parameterTypes: ParameterTypesOf<NumberInterpretedSchema> = {
    min: ['number', ISSUE_OPTIONS_TYPE],
    max: ['number', ISSUE_OPTIONS_TYPE],
    int: [ISSUE_OPTIONS_TYPE],
  };

  public static override readonly argumentMessages = {
    min: NUMBER_SCHEMA_ISSUE_MESSAGE.min,
    max: NUMBER_SCHEMA_ISSUE_MESSAGE.max,
  } satisfies ArgumentMessagesOf<NumberInterpretedSchema>;

  /** `typeof field0 !== "number" || Number.isNaN(field0)`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return this.emitTypeCheck({
      failsWhen: js`typeof ${value} !== "number" || Number.isNaN(${value})`,
      message: NUMBER_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }
}
