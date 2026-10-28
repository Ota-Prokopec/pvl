// The code a `BooleanSchema` compiles to: its type check, as it has no
// Constraint, and `.coerce()`, its conversion, held in its
// `preModifierSteps` table.
import { BOOLEAN_SCHEMA_ISSUE_MESSAGE, type BooleanInterpretedSchema } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmittedCheck } from './types/emittedText.js';
import type { EmitterMethodOf, PreModifierStepTable } from './types/methodTables.js';
import type { EmittedPreModifierStep } from './types/schemaParts.js';
import { emitCoerceToBoolean } from './utils/coercions.js';
import { emitTypeCheck } from './utils/emittedText.js';
import { js } from './utils/js.js';
import type { EmitBaseCheckArgs } from './schemaEmitter.js';

/** `.coerce()` → `field0 = Boolean(field0)` for a string, a number or a bigint, as `coerceToBoolean` converts. */
const coerce: EmitterMethodOf<BooleanInterpretedSchema['coerce'], EmittedPreModifierStep> = ({
  target,
}) => ({
  coercion: emitCoerceToBoolean(target.value),
});

export class BooleanSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly preModifierSteps = {
    ...ChainableSchemaEmitter.preModifierSteps,
    coerce,
  } satisfies PreModifierStepTable;

  /** `typeof field0 !== "boolean"`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitTypeCheck({
      failsWhen: js`typeof ${value} !== "boolean"`,
      message: BOOLEAN_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }
}
