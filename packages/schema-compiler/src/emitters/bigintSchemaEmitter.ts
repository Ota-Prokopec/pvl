// The code a `BigintSchema` compiles to, one method per method of
// `BigintInterpretedSchema` it mirrors: its Constraints, held in its
// `postModifierChecks` table, and `.coerce()`, written by its `_emitCoercion`
// hook.
import { BIGINT_SCHEMA_ISSUE_MESSAGE, type BigintInterpretedSchema, ISSUE_CODE } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { emitCoerceToBigint } from './coercions.js';
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

/** `.min(0n)` → `field0 < 0n`, reporting `TOO_SMALL`. */
const min: EmitterMethodOf<BigintInterpretedSchema['min']> = ({
  target: { value, issuePath },
  args: [minValue, options],
}) =>
  emitCheck({
    failsWhen: js`${value} < ${emitArgument(minValue)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_SMALL,
      path: issuePath,
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
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(BigintSchemaEmitter.argumentMessages.max, maxValue),
    }),
  });

export class BigintSchemaEmitter extends ChainableSchemaEmitter {
  /** `.coerce()` → `field0 = BigInt(field0)` for a string or a number it accepts, as `coerceToBigint` converts. */
  public static override _emitCoercion({ value }: EmitCoercionHookArgs): EmittedCoercion {
    return emitCoerceToBigint(value);
  }

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
    return this.emitTypeCheck({
      failsWhen: js`typeof ${value} !== "bigint"`,
      message: BIGINT_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }
}
