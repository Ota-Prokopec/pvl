// The code a `BooleanSchema` compiles to: its type check, as it has no
// Constraint, and `.coerce()`, written by its `_emitCoercion` hook.
import { BOOLEAN_SCHEMA_ISSUE_MESSAGE } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { emitCoerceToBoolean } from './coercions.js';
import type { EmitBaseCheckArgs, EmitCoercionHookArgs } from './emitter.js';
import type { EmittedCheck, EmittedCoercion } from './types.js';
import { js } from './emitterUtils.js';

export class BooleanSchemaEmitter extends ChainableSchemaEmitter {
  /** `.coerce()` → `field0 = Boolean(field0)` for a string, a number or a bigint, as `coerceToBoolean` converts. */
  public static override _emitCoercion({ value }: EmitCoercionHookArgs): EmittedCoercion {
    return emitCoerceToBoolean(value);
  }

  /** `typeof field0 !== "boolean"`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return this.emitTypeCheck({
      failsWhen: js`typeof ${value} !== "boolean"`,
      message: BOOLEAN_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }
}
