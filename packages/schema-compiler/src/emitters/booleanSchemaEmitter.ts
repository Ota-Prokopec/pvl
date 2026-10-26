// The code a `BooleanSchema` compiles to: its type check, as it has no
// Constraint, and `.coerce()`, written by its `_emitCoercion` hook.
import { BOOLEAN_SCHEMA_ISSUE_MESSAGE } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmittedCheck, EmittedCoercion } from './types/emittedText.js';
import type { EmitCoercionArgs } from './types/hookArgs.js';
import { emitCoerceToBoolean } from './utils/coercions.js';
import { emitTypeCheck } from './utils/emittedText.js';
import { js } from './utils/js.js';
import type { EmitBaseCheckArgs } from './schemaEmitter.js';

export class BooleanSchemaEmitter extends ChainableSchemaEmitter {
  /** `.coerce()` → `field0 = Boolean(field0)` for a string, a number or a bigint, as `coerceToBoolean` converts. */
  public static override _emitCoercion({ target }: EmitCoercionArgs): EmittedCoercion {
    return emitCoerceToBoolean(target.value);
  }

  /** `typeof field0 !== "boolean"`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitTypeCheck({
      failsWhen: js`typeof ${value} !== "boolean"`,
      message: BOOLEAN_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }
}
