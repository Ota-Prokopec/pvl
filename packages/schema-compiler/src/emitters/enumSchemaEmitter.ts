// The code an `EnumSchema` compiles to: its membership check, as it has no
// Constraint.
import { ENUM_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE } from '@pvl/schema';
import type { EnumSchema } from '../schemas/enumSchema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitChecksArgs, EmitSchemaArgs } from './emitter.js';
import { emitIssue } from '../issue.js';
import type { EmittedCheck } from '../types.js';
import { emitCheck, emitLiteral, js, spellLiteralType } from './emitterUtils.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';

export class EnumSchemaEmitter extends ChainableSchemaEmitter {
  /**
   * `pvl.enum(['A', 'B'])` → `field0 !== "A" && field0 !== "B"`, reporting
   * `INVALID_VALUE`.
   */
  public static override _emitBaseCheck({
    target: { value, issuePath },
    schema: { members },
  }: EmitChecksArgs<EnumSchema>): EmittedCheck {
    return emitCheck({
      failsWhen: members.map((member) => js`${value} !== ${emitLiteral(member)}`).join(' && '),
      issue: emitIssue(
        ISSUE_CODE.INVALID_VALUE,
        ENUM_SCHEMA_ISSUE_MESSAGE._checkType(members),
        issuePath,
      ),
    });
  }

  /**
   * The union of the members' types.
   *
   * ```ts
   * EnumSchemaEmitter._spellFactoryTypes({ schema: <pvl.enum(['A', 'B'])> }) // { input: '"A" | "B"', output: '"A" | "B"' }
   * ```
   */
  public static override _spellFactoryTypes({ schema }: EmitSchemaArgs<EnumSchema>): SchemaTypes {
    const type = schema.members.map((member) => spellLiteralType(member)).join(' | ');
    return { input: type, output: type };
  }
}
