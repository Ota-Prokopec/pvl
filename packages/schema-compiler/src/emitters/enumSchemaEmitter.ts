// The code an `EnumSchema` compiles to: its membership check, as it has no
// Constraint.
import { ENUM_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE } from '@pvl/schema';
import type { EnumSchema } from '../schemas/enumSchema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitBaseCheckArgs, SpellFactoryTypesArgs } from './emitter.js';
import type { EmittedCheck } from './emittersTypes.js';
import { emitLiteral, js, spellLiteralType } from './emitterUtils.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';

export class EnumSchemaEmitter extends ChainableSchemaEmitter {
  /**
   * `pvl.enum(['A', 'B'])` → `field0 !== "A" && field0 !== "B"`, reporting
   * `INVALID_VALUE`.
   */
  public static _emitBaseCheck({
    target: { value, issuePath },
    schema: { members },
  }: EmitBaseCheckArgs<EnumSchema>): EmittedCheck {
    return this.emitTypeCheck({
      failsWhen: members.map((member) => js`${value} !== ${emitLiteral(member)}`).join(' && '),
      message: ENUM_SCHEMA_ISSUE_MESSAGE._checkType(members),
      issuePath,
      code: ISSUE_CODE.INVALID_VALUE,
    });
  }

  /**
   * The union of the members' types.
   *
   * ```ts
   * EnumSchemaEmitter._spellFactoryTypes({ schema: <pvl.enum(['A', 'B'])> }) // { input: '"A" | "B"', output: '"A" | "B"' }
   * ```
   */
  public static override _spellFactoryTypes({
    schema,
  }: SpellFactoryTypesArgs<EnumSchema>): SchemaTypes {
    const type = schema.members.map((member) => spellLiteralType(member)).join(' | ');
    return { input: type, output: type };
  }
}
