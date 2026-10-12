// The code an `EnumSchema` compiles to: its membership check, as it has no
// Constraint.
import { ENUM_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE } from '@pvl/schema';
import type { EnumSchema } from '../schemas/enumSchema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitChecksArgs, EmitSchemaArgs } from './emitter.js';
import type { EmittingCheckMethodOutputWithCheck } from './emittersTypes.js';
import { emitIssue, emitLiteral, js, spellLiteralType, type SchemaTypes } from './utils.js';

export class EnumSchemaEmitter extends ChainableSchemaEmitter {
  /**
   * `pvl.enum(['A', 'B'])` → `field0 !== "A" && field0 !== "B"`, reporting
   * `INVALID_VALUE`.
   */
  public static override _getBaseCheck({
    target: { value, issuePath },
    schema: { members },
  }: EmitChecksArgs<EnumSchema>): EmittingCheckMethodOutputWithCheck {
    return {
      failsWhen: members.map((member) => js`${value} !== ${emitLiteral(member)}`).join(' && '),
      issue: emitIssue(
        ISSUE_CODE.INVALID_VALUE,
        ENUM_SCHEMA_ISSUE_MESSAGE._checkType(members),
        issuePath,
      ),
    };
  }

  /**
   * The union of the members' types.
   *
   * ```ts
   * EnumSchemaEmitter._spellTypes({ schema: <pvl.enum(['A', 'B'])>, scope }) // { input: '"A" | "B"', output: '"A" | "B"' }
   * ```
   */
  public static override _spellTypes({ schema }: EmitSchemaArgs<EnumSchema>): SchemaTypes {
    const type = schema.members.map((member) => spellLiteralType(member)).join(' | ');
    return { input: type, output: type };
  }
}
