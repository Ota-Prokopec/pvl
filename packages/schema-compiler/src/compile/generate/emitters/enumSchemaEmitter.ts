// The code an `EnumSchema` compiles to: its membership check, as it has no
// Constraint.
import { ENUM_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, type EnumMember } from '@pvl/schema';
import { emitIssue, emitLiteral, js, type EmitTarget, type EmittedCheck } from './utils.js';

export class EnumSchemaEmitter {
  /**
   * `pvl.enum(['A', 'B'])` → `field0 !== "A" && field0 !== "B"`, reporting
   * `INVALID_VALUE`.
   */
  public static _checkType(
    { value, path }: EmitTarget,
    members: ReadonlyArray<EnumMember>,
  ): EmittedCheck {
    return {
      failsWhen: members.map((member) => js`${value} !== ${emitLiteral(member)}`).join(' && '),
      issue: emitIssue(
        ISSUE_CODE.INVALID_VALUE,
        ENUM_SCHEMA_ISSUE_MESSAGE._checkType(members),
        path,
      ),
    };
  }
}
