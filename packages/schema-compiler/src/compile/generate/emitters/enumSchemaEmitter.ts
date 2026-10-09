// The code an `EnumSchema` compiles to: its membership check, as it has no
// Constraint.
import { ENUM_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, type EnumMember } from '@pvl/schema';
import { SCHEMA_FACTORY } from '../enums.js';
import type { SchemaModel } from '../schemaModel.js';
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
  public static override _emitTypeCheck(schema: SchemaModel, target: EmitTarget): EmittedCheck {
    if (schema.factory !== SCHEMA_FACTORY.ENUM) {
      throw new Error(`EnumSchemaEmitter can't emit a pvl.${schema.factory}().`);
    }
    return this._checkType(target, schema.members);
  }

  /**
   * The union of the members' types.
   *
   * ```ts
   * EnumSchemaEmitter._spellTypes(<pvl.enum(['A', 'B'])>) // { input: '"A" | "B"', output: '"A" | "B"' }
   * ```
   */
  public static override _spellTypes(schema: SchemaModel): SchemaTypes {
    if (schema.factory !== SCHEMA_FACTORY.ENUM) {
      throw new Error(`EnumSchemaEmitter can't spell a pvl.${schema.factory}().`);
    }
    const type = schema.members.map((member) => spellLiteralType(member)).join(' | ');
    return { input: type, output: type };
  }
}
