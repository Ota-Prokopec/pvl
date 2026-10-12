// The code a `BooleanSchema` compiles to: its type check, as it has no
// Constraint.
import { BOOLEAN_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitChecksArgs } from './emitter.js';
import type { EmittingCheckMethodOutputWithCheck } from './emittersTypes.js';
import { emitIssue, js } from './utils.js';

export class BooleanSchemaEmitter extends ChainableSchemaEmitter {
  /** `typeof field0 !== "boolean"`, reporting `INVALID_TYPE`. */
  public static override _getBaseCheck({
    target: { value, issuePath },
  }: EmitChecksArgs): EmittingCheckMethodOutputWithCheck {
    return {
      failsWhen: js`typeof ${value} !== "boolean"`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_TYPE,
        BOOLEAN_SCHEMA_ISSUE_MESSAGE._checkType(),
        issuePath,
      ),
    };
  }
}
