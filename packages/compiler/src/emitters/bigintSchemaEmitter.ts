// The code a `BigintSchema` compiles to, one method per method of
// `BigintInterpretedSchema` it mirrors: its Constraints, held in its
// `postModifierSteps` table, and `.coerce()`, its conversion, held in its
// `preModifierSteps` table.
import {
  BIGINT_SCHEMA_ISSUE_MESSAGE,
  type BigintInterpretedSchema,
  ISSUE_CODE,
} from '@pcvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { BIGINT_ARGUMENT_MESSAGES } from './consts/argumentMessages.js';
import type { EmittedCheck } from './types/emittedText.js';
import type {
  EmitterMethodOf,
  ParameterTypesOf,
  PostModifierStepTable,
  PreModifierStepTable,
} from './types/methodTables.js';
import type { EmittedPreModifierStep } from './types/schemaParts.js';
import { emitArgument } from './utils/arguments.js';
import { emitCoerceToBigint } from './utils/coercions.js';
import { emitCheck, emitTypeCheck } from './utils/emittedText.js';
import { js } from './utils/js.js';
import type { EmitBaseCheckArgs } from './schemaEmitter.js';
import { emitConstraintIssue, emitDefaultMessage } from '../issue/utils.js';
import { CHECK_OPTIONS_TYPE_STRING } from './consts/checkOptions.js';

/** `.min(0n)` → `field0 < 0n`, reporting `TOO_SMALL`. */
const min: EmitterMethodOf<BigintInterpretedSchema['min']> = ({
  target: { value, issuePath },
  args: [minValue, options],
}) => ({
  check: emitCheck({
    failsWhen: js`${value} < ${emitArgument(minValue)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_SMALL,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(BIGINT_ARGUMENT_MESSAGES.min, minValue),
    }),
  }),
});

/** `.max(9n)` → `field0 > 9n`, reporting `TOO_BIG`. */
const max: EmitterMethodOf<BigintInterpretedSchema['max']> = ({
  target: { value, issuePath },
  args: [maxValue, options],
}) => ({
  check: emitCheck({
    failsWhen: js`${value} > ${emitArgument(maxValue)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_BIG,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(BIGINT_ARGUMENT_MESSAGES.max, maxValue),
    }),
  }),
});

/** `.coerce()` → `field0 = BigInt(field0)` for a string or a number it accepts, as `coerceToBigint` converts. */
const coerce: EmitterMethodOf<BigintInterpretedSchema['coerce'], EmittedPreModifierStep> = ({
  target,
}) => ({
  coercion: emitCoerceToBigint(target.value),
});

export class BigintSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly preModifierSteps = {
    ...ChainableSchemaEmitter.preModifierSteps,
    coerce,
  } satisfies PreModifierStepTable;

  public static override readonly postModifierSteps = {
    ...ChainableSchemaEmitter.postModifierSteps,
    min,
    max,
  } satisfies PostModifierStepTable;

  public static override readonly parameterTypes: ParameterTypesOf<BigintInterpretedSchema> = {
    min: ['bigint', CHECK_OPTIONS_TYPE_STRING],
    max: ['bigint', CHECK_OPTIONS_TYPE_STRING],
  };

  public static override readonly argumentMessages = BIGINT_ARGUMENT_MESSAGES;

  /** `typeof field0 !== "bigint"`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitTypeCheck({
      failsWhen: js`typeof ${value} !== "bigint"`,
      message: BIGINT_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }
}
