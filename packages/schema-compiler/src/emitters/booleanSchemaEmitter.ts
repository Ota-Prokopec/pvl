// The code a `BooleanSchema` compiles to: its type check, as it has no
// Constraint.
import { BOOLEAN_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitChecksArgs } from './emitter.js';
import { emitIssue } from '../issue.js';
import type { EmittedCheck } from '../types.js';
import { emitCheck, js } from './emitterUtils.js';

export class BooleanSchemaEmitter extends ChainableSchemaEmitter {
  /** `typeof field0 !== "boolean"`, reporting `INVALID_TYPE`. */
  public static override _emitBaseCheck({
    target: { value, issuePath },
  }: EmitChecksArgs): EmittedCheck {
    return emitCheck({
      failsWhen: js`typeof ${value} !== "boolean"`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_TYPE,
        BOOLEAN_SCHEMA_ISSUE_MESSAGE._checkType(),
        issuePath,
      ),
    });
  }
}
