// The code a `StringSchema` compiles to, one method per method of
// `StringInterpretedSchema` it mirrors: its Constraints, held in its
// `postModifierSteps` table, and `.coerce()`, its conversion, held in its
// `preModifierSteps` table.
import { ISSUE_CODE, STRING_SCHEMA_ISSUE_MESSAGE, type StringInterpretedSchema } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { STRING_ARGUMENT_MESSAGES } from './consts/argumentMessages.js';
import type { EmittedCheck } from './types/emittedText.js';
import type {
  EmitterMethodOf,
  ParameterTypesOf,
  PostModifierStepTable,
  PreModifierStepTable,
} from './types/methodTables.js';
import type { EmittedPreModifierStep } from './types/schemaParts.js';
import { emitArgument } from './utils/arguments.js';
import { emitCoerceToString } from './utils/coercions.js';
import { emitCheck, emitTypeCheck } from './utils/emittedText.js';
import { js } from './utils/js.js';
import type { EmitBaseCheckArgs } from './schemaEmitter.js';
import { emitConstraintIssue, emitDefaultMessage } from '../issue.js';
import { CHECK_OPTIONS_TYPE_STRING } from './consts/checkOptions.js';

/** `.min(3)` → `field0.length < 3`, reporting `TOO_SMALL`. */
const min: EmitterMethodOf<StringInterpretedSchema['min']> = ({
  target: { value, issuePath },
  args: [minLength, options],
}) => ({
  check: emitCheck({
    failsWhen: js`${value}.length < ${emitArgument(minLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_SMALL,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(STRING_ARGUMENT_MESSAGES.min, minLength),
    }),
  }),
});

/** `.max(20)` → `field0.length > 20`, reporting `TOO_BIG`. */
const max: EmitterMethodOf<StringInterpretedSchema['max']> = ({
  target: { value, issuePath },
  args: [maxLength, options],
}) => ({
  check: emitCheck({
    failsWhen: js`${value}.length > ${emitArgument(maxLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_BIG,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(STRING_ARGUMENT_MESSAGES.max, maxLength),
    }),
  }),
});

/** `.length(2)` → `field0.length !== 2`, reporting `INVALID_LENGTH`. */
const length: EmitterMethodOf<StringInterpretedSchema['length']> = ({
  target: { value, issuePath },
  args: [exactLength, options],
}) => ({
  check: emitCheck({
    failsWhen: js`${value}.length !== ${emitArgument(exactLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.INVALID_LENGTH,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(STRING_ARGUMENT_MESSAGES.length, exactLength),
    }),
  }),
});

/** `.coerce()` → `field0 = String(field0);`, as `coerceToString` converts. */
const coerce: EmitterMethodOf<StringInterpretedSchema['coerce'], EmittedPreModifierStep> = ({
  target,
}) => ({
  coercion: emitCoerceToString(target.value),
});

export class StringSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly preModifierSteps = {
    ...ChainableSchemaEmitter.preModifierSteps,
    coerce,
  } satisfies PreModifierStepTable;

  public static override readonly postModifierSteps = {
    ...ChainableSchemaEmitter.postModifierSteps,
    min,
    max,
    length,
  } satisfies PostModifierStepTable;

  public static override readonly parameterTypes: ParameterTypesOf<StringInterpretedSchema> = {
    min: ['number', CHECK_OPTIONS_TYPE_STRING],
    max: ['number', CHECK_OPTIONS_TYPE_STRING],
    length: ['number', CHECK_OPTIONS_TYPE_STRING],
  };

  public static override readonly argumentMessages = STRING_ARGUMENT_MESSAGES;

  /**
   * ```ts
   * StringSchemaEmitter._emitBaseCheck({ schema, target: { value: 'field0', path, issuePath } })
   * // 'if (typeof field0 !== "string") {\n  issues.push({ code: "INVALID_TYPE", … });\n}'
   * ```
   */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitTypeCheck({
      failsWhen: js`typeof ${value} !== "string"`,
      message: STRING_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }
}
