// The code a `LiteralSchema` compiles to: its value check, as it has no
// Constraint.
import { ISSUE_CODE, LITERAL_SCHEMA_ISSUE_MESSAGE, type PossibleLiteralValue } from '@pvl/schema';
import { emitIssue, emitLiteral, js, type EmitTarget, type EmittedCheck } from './utils.js';

export class LiteralSchemaEmitter {
  /**
   * `pvl.literal('a')` → `!Object.is(field0, "a")`, reporting
   * `INVALID_VALUE`. `Object.is`, as the interpreted check uses, so `0` and
   * `-0` stay apart.
   */
  public static _checkType(
    { value, path }: EmitTarget,
    literalValue: PossibleLiteralValue,
  ): EmittedCheck {
    return {
      failsWhen: js`!Object.is(${value}, ${emitLiteral(literalValue)})`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_VALUE,
        LITERAL_SCHEMA_ISSUE_MESSAGE._checkType(literalValue),
        path,
      ),
    };
  }
}
