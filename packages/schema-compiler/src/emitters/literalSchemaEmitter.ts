// The code a `LiteralSchema` compiles to: its value check, as it has no
// Constraint, and `.coerce()`, which converts as the primitive of its value
// does.
import { ISSUE_CODE, LITERAL_SCHEMA_ISSUE_MESSAGE } from '@pvl/schema';
import type { LiteralSchema } from '../schemas/literalSchema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import {
  emitCoerceToBigint,
  emitCoerceToBoolean,
  emitCoerceToNumber,
  emitCoerceToString,
} from './coercions.js';
import type { EmitBaseCheckArgs, EmitCoerceArgs, SpellFactoryTypesArgs } from './emitter.js';
import type { EmittedCheck, EmittedCoercion } from './emittersTypes.js';
import { emitLiteral, js, spellLiteralType } from './emitterUtils.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';

export class LiteralSchemaEmitter extends ChainableSchemaEmitter {
  /**
   * `.coerce()` → the conversion of the primitive its value is, so the
   * value check then decides.
   *
   * ```ts
   * LiteralSchemaEmitter._emitCoerce({ schema: <pvl.literal(1)>, target: { value: 'field0', path, issuePath }, call: <.coerce()> })
   * // 'if (typeof field0 === "string" || typeof field0 === "boolean") {\n  field0 = Number(field0);\n}'
   * ```
   */
  public static override _emitCoerce({
    schema,
    target: { value },
  }: EmitCoerceArgs<LiteralSchema>): EmittedCoercion {
    // By the type of its value, as `LiteralInterpretedSchema._coerceInput` picks it.
    switch (typeof schema.value) {
      case 'string':
        return emitCoerceToString(value);
      case 'number':
        return emitCoerceToNumber(value);
      case 'boolean':
        return emitCoerceToBoolean(value);
      default:
        return emitCoerceToBigint(value);
    }
  }

  /**
   * `pvl.literal('a')` → `!Object.is(field0, "a")`, reporting
   * `INVALID_VALUE`. `Object.is`, as the interpreted check uses, so `0` and
   * `-0` stay apart.
   */
  public static _emitBaseCheck({
    target: { value, issuePath },
    schema: { value: literalValue },
  }: EmitBaseCheckArgs<LiteralSchema>): EmittedCheck {
    return this.emitTypeCheck({
      failsWhen: js`!Object.is(${value}, ${emitLiteral(literalValue)})`,
      message: LITERAL_SCHEMA_ISSUE_MESSAGE._checkType(literalValue),
      issuePath,
      code: ISSUE_CODE.INVALID_VALUE,
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
