// The code a `BooleanSchema` compiles to: its type check, as it has no
// Constraint.
import { BOOLEAN_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, Issue } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitBaseCheckArgs } from './emitter.js';
import { emitIssue } from '../issue.js';
import type { EmittedCheck } from './emittersTypes.js';
import { emitCheck, js } from './emitterUtils.js';

export class BooleanSchemaEmitter extends ChainableSchemaEmitter {
  /** `typeof field0 !== "boolean"`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitCheck({
      failsWhen: js`typeof ${value} !== "boolean"`,
      issue: emitIssue(
        new Issue(ISSUE_CODE.INVALID_TYPE, [issuePath], BOOLEAN_SCHEMA_ISSUE_MESSAGE._checkType()),
      ),
    });
  }
}
