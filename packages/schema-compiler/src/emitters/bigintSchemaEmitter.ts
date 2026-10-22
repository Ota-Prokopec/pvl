// The code a `BigintSchema` compiles to, one method per method of
// `BigintInterpretedSchema` it mirrors, held in its `postModifierChecks` table.
import { BIGINT_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, type BigintInterpretedSchema } from '@pvl/schema';
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

/** `.min(0n)` → `field0 < 0n`, reporting `TOO_SMALL`. */
const min: EmitterMethodOf<BigintInterpretedSchema['min']> = ({
  target: { value, issuePath },
  args: [minValue, options],
}) =>
  emitCheck({
    failsWhen: js`${value} < ${emitArgument(minValue)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_SMALL,
      issuePath,
      options,
      defaultMessage: emitDefaultMessage(BigintSchemaEmitter.argumentMessages.min, minValue),
    }),
  });

/** `.max(9n)` → `field0 > 9n`, reporting `TOO_BIG`. */
const max: EmitterMethodOf<BigintInterpretedSchema['max']> = ({
  target: { value, issuePath },
  args: [maxValue, options],
}) =>
  emitCheck({
    failsWhen: js`${value} > ${emitArgument(maxValue)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_BIG,
      issuePath,
      options,
      defaultMessage: emitDefaultMessage(BigintSchemaEmitter.argumentMessages.max, maxValue),
    }),
  });

export class BigintSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly postModifierChecks = {
    ...ChainableSchemaEmitter.postModifierChecks,
    min,
    max,
  } satisfies PostModifierCheckTable;

  public static override readonly parameterTypes: ParameterTypesOf<BigintInterpretedSchema> = {
    min: ['bigint', ISSUE_OPTIONS_TYPE],
    max: ['bigint', ISSUE_OPTIONS_TYPE],
  };

  public static override readonly argumentMessages = {
    min: BIGINT_SCHEMA_ISSUE_MESSAGE.min,
    max: BIGINT_SCHEMA_ISSUE_MESSAGE.max,
  } satisfies ArgumentMessagesOf<BigintInterpretedSchema>;

  /** `typeof field0 !== "bigint"`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitCheck({
      failsWhen: js`typeof ${value} !== "bigint"`,
      issue: emitIssue({
        code: ISSUE_CODE.INVALID_TYPE,
        message: BIGINT_SCHEMA_ISSUE_MESSAGE._checkType(),
        issuePath,
      }),
    });
  }
}
