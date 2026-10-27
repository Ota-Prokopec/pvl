// The code a `NumberSchema` compiles to, one method per method of
// `NumberInterpretedSchema` it mirrors: its Constraints, held in its
// `postModifierSteps` table, and `.coerce()`, its conversion, held in its
// `preModifierSteps` table.
import { ISSUE_CODE, NUMBER_SCHEMA_ISSUE_MESSAGE, type NumberInterpretedSchema } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { NUMBER_ARGUMENT_MESSAGES } from './consts/argumentMessages.js';
import type { EmittedCheck } from './types/emittedText.js';
import type {
  EmitterMethodOf,
  ParameterTypesOf,
  PostModifierStepTable,
  PreModifierStepTable,
} from './types/methodTables.js';
import type { EmittedPreModifierStep } from './types/schemaParts.js';
import { emitArgument } from './utils/arguments.js';
import { emitCoerceToNumber } from './utils/coercions.js';
import { emitCheck, emitTypeCheck } from './utils/emittedText.js';
import { js } from './utils/js.js';
import type { EmitBaseCheckArgs } from './schemaEmitter.js';
import { emitConstraintIssue, emitDefaultMessage } from '../issue.js';
import { CHECK_OPTIONS_TYPE_STRING } from './consts/checkOptions.js';

/** `.min(0)` → `field0 < 0`, reporting `TOO_SMALL`. */
const min: EmitterMethodOf<NumberInterpretedSchema['min']> = ({
  target: { value, issuePath },
  args: [minValue, options],
}) => ({
  check: emitCheck({
    failsWhen: js`${value} < ${emitArgument(minValue)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_SMALL,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(NUMBER_ARGUMENT_MESSAGES.min, minValue),
    }),
  }),
});

/** `.max(9)` → `field0 > 9`, reporting `TOO_BIG`. */
const max: EmitterMethodOf<NumberInterpretedSchema['max']> = ({
  target: { value, issuePath },
  args: [maxValue, options],
}) => ({
  check: emitCheck({
    failsWhen: js`${value} > ${emitArgument(maxValue)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_BIG,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(NUMBER_ARGUMENT_MESSAGES.max, maxValue),
    }),
  }),
});

/** `.int()` → `!Number.isInteger(field0)`, reporting `NOT_INTEGER`. */
const int: EmitterMethodOf<NumberInterpretedSchema['int']> = ({
  target: { value, issuePath },
  args: [options],
}) => ({
  check: emitCheck({
    failsWhen: js`!Number.isInteger(${value})`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.NOT_INTEGER,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(NUMBER_SCHEMA_ISSUE_MESSAGE.int),
    }),
  }),
});

/** `.coerce()` → `field0 = Number(field0)` for a string or a boolean, as `coerceToNumber` converts. */
const coerce: EmitterMethodOf<NumberInterpretedSchema['coerce'], EmittedPreModifierStep> = ({
  target,
}) => ({
  coercion: emitCoerceToNumber(target.value),
});

export class NumberSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly preModifierSteps = {
    ...ChainableSchemaEmitter.preModifierSteps,
    coerce,
  } satisfies PreModifierStepTable;

  public static override readonly postModifierSteps = {
    ...ChainableSchemaEmitter.postModifierSteps,
    min,
    max,
    int,
  } satisfies PostModifierStepTable;

  public static override readonly parameterTypes: ParameterTypesOf<NumberInterpretedSchema> = {
    min: ['number', CHECK_OPTIONS_TYPE_STRING],
    max: ['number', CHECK_OPTIONS_TYPE_STRING],
    int: [CHECK_OPTIONS_TYPE_STRING],
  };

  public static override readonly argumentMessages = NUMBER_ARGUMENT_MESSAGES;

  /** `typeof field0 !== "number" || Number.isNaN(field0)`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitTypeCheck({
      failsWhen: js`typeof ${value} !== "number" || Number.isNaN(${value})`,
      message: NUMBER_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }
}
