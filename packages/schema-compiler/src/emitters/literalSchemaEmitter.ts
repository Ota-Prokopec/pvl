// The code a `LiteralSchema` compiles to: its value check, as it has no
// Constraint.
import { ISSUE_CODE, LITERAL_SCHEMA_ISSUE_MESSAGE, type PossibleLiteralValue } from '@pvl/schema';
import type { LiteralSchema } from '../schemas/literalSchema.js';
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

export class LiteralSchemaEmitter extends ChainableSchemaEmitter {
  /**
   * `pvl.literal('a')` → `!Object.is(field0, "a")`, reporting
   * `INVALID_VALUE`. `Object.is`, as the interpreted check uses, so `0` and
   * `-0` stay apart.
   */
  public static override _checkType(
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

  /** `_checkType` with the value `pvl.literal()` was given. */
  public static override _emitTypeCheck(schema: LiteralSchema, target: EmitTarget): EmittedCheck {
    return this._checkType(target, schema.value);
  }

  /**
   * The literal value's own type.
   *
   * ```ts
   * LiteralSchemaEmitter._spellTypes(<pvl.literal('a')>) // { input: '"a"', output: '"a"' }
   * ```
   */
  public static override _spellTypes(schema: LiteralSchema): SchemaTypes {
    const type = spellLiteralType(schema.value);
    return { input: type, output: type };
  }
}
