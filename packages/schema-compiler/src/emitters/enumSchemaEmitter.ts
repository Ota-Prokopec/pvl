// The code an `EnumSchema` compiles to: its membership check, as it has no
// Constraint.
import { ENUM_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, type EnumMember } from '@pvl/schema';
import type { EnumSchema } from '../schemas/enumSchema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import {
  emitIssue,
  emitLiteral,
  js,
  spellLiteralType,
  type EmitTarget,
  type EmittedCheck,
  type SchemaTypes,
} from './utils.js';

export class EnumSchemaEmitter extends ChainableSchemaEmitter {
  /**
   * `pvl.enum(['A', 'B'])` → `field0 !== "A" && field0 !== "B"`, reporting
   * `INVALID_VALUE`.
   */
  public static override _checkType(
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

  /** `_checkType` with the members `pvl.enum()` was given. */
  public static override _emitTypeCheck(schema: EnumSchema, target: EmitTarget): EmittedCheck {
    return this._checkType(target, schema.members);
  }

  /**
   * The union of the members' types.
   *
   * ```ts
   * EnumSchemaEmitter._spellTypes(<pvl.enum(['A', 'B'])>) // { input: '"A" | "B"', output: '"A" | "B"' }
   * ```
   */
  public static override _spellTypes(schema: EnumSchema): SchemaTypes {
    const type = schema.members.map((member) => spellLiteralType(member)).join(' | ');
    return { input: type, output: type };
  }
}
