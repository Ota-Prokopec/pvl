// The code a `BooleanSchema` compiles to: its type check, as it has no
// Constraint.
import { BOOLEAN_SCHEMA_ISSUE_MESSAGE } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitBaseCheckArgs } from './emitter.js';
import type { EmittedCheck } from './emittersTypes.js';
import { js } from './emitterUtils.js';

export class BooleanSchemaEmitter extends ChainableSchemaEmitter {
  /** `typeof field0 !== "boolean"`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return this.emitTypeCheck({
      failsWhen: js`typeof ${value} !== "boolean"`,
      message: BOOLEAN_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }
}
