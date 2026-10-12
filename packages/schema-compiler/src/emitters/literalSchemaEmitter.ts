// The code a `LiteralSchema` compiles to: its value check, as it has no
// Constraint.
import { ISSUE_CODE, LITERAL_SCHEMA_ISSUE_MESSAGE } from '@pvl/schema';
import type { LiteralSchema } from '../schemas/literalSchema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitChecksArgs, EmitSchemaArgs } from './emitter.js';
import type { EmittingCheckMethodOutputWithCheck } from './emittersTypes.js';
import { emitIssue, emitLiteral, js, spellLiteralType, type SchemaTypes } from './utils.js';

export class LiteralSchemaEmitter extends ChainableSchemaEmitter {
  /**
   * `pvl.literal('a')` → `!Object.is(field0, "a")`, reporting
   * `INVALID_VALUE`. `Object.is`, as the interpreted check uses, so `0` and
   * `-0` stay apart.
   */
  public static override _getBaseCheck({
    target: { value, issuePath },
    schema: { value: literalValue },
  }: EmitChecksArgs<LiteralSchema>): EmittingCheckMethodOutputWithCheck {
    return {
      failsWhen: js`!Object.is(${value}, ${emitLiteral(literalValue)})`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_VALUE,
        LITERAL_SCHEMA_ISSUE_MESSAGE._checkType(literalValue),
        issuePath,
      ),
    };
  }

  /**
   * The literal value's own type.
   *
   * ```ts
   * LiteralSchemaEmitter._spellTypes({ schema: <pvl.literal('a')>, scope }) // { input: '"a"', output: '"a"' }
   * ```
   */
  public static override _spellTypes({ schema }: EmitSchemaArgs<LiteralSchema>): SchemaTypes {
    const type = spellLiteralType(schema.value);
    return { input: type, output: type };
  }
}
