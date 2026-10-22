// The code a `LiteralSchema` compiles to: its value check, as it has no
// Constraint.
import { ISSUE_CODE, LITERAL_SCHEMA_ISSUE_MESSAGE } from '@pvl/schema';
import type { LiteralSchema } from '../schemas/literalSchema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitBaseCheckArgs, SpellFactoryTypesArgs } from './emitter.js';
import { emitIssue } from '../issue.js';
import type { EmittedCheck } from './emittersTypes.js';
import { emitCheck, emitLiteral, js, spellLiteralType } from './emitterUtils.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';

export class LiteralSchemaEmitter extends ChainableSchemaEmitter {
  /**
   * `pvl.literal('a')` → `!Object.is(field0, "a")`, reporting
   * `INVALID_VALUE`. `Object.is`, as the interpreted check uses, so `0` and
   * `-0` stay apart.
   */
  public static _emitBaseCheck({
    target: { value, issuePath },
    schema: { value: literalValue },
  }: EmitBaseCheckArgs<LiteralSchema>): EmittedCheck {
    return emitCheck({
      failsWhen: js`!Object.is(${value}, ${emitLiteral(literalValue)})`,
      issue: emitIssue({
        code: ISSUE_CODE.INVALID_VALUE,
        message: LITERAL_SCHEMA_ISSUE_MESSAGE._checkType(literalValue),
        path: issuePath,
      }),
    });
  }

  /**
   * The literal value's own type.
   *
   * ```ts
   * LiteralSchemaEmitter._spellFactoryTypes({ schema: <pvl.literal('a')> }) // { input: '"a"', output: '"a"' }
   * ```
   */
  public static override _spellFactoryTypes({
    schema,
  }: SpellFactoryTypesArgs<LiteralSchema>): SchemaTypes {
    const type = spellLiteralType(schema.value);
    return { input: type, output: type };
  }
}
