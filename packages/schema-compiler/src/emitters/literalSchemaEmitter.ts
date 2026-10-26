// The code a `LiteralSchema` compiles to: its value check, as it has no
// Constraint, and `.coerce()`, written by its `_emitCoercion` hook, which
// converts as the primitive of its value does.
import { ISSUE_CODE, LITERAL_SCHEMA_ISSUE_MESSAGE } from '@pvl/schema';
import type { LiteralSchema } from '../schemas/literalSchema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import {
  emitCoerceToBigint,
  emitCoerceToBoolean,
  emitCoerceToNumber,
  emitCoerceToString,
} from './coercions.js';
import type { EmitCoercionArgs, SpellTypesArgs } from './emitter.js';
import type { EmitBaseCheckArgs } from './schemaEmitter.js';
import type { EmittedCheck, EmittedCoercion } from './types.js';
import { emitLiteral, js, spellLiteralType } from './emitterUtils.js';
import type { SchemaTypes, SpelledType } from '../schemas/schemaTypes.js';
import { UNDEFINEDNESS } from '../enums.js';

export class LiteralSchemaEmitter extends ChainableSchemaEmitter {
  /**
   * `.coerce()` → the conversion of the primitive its value is, so the
   * value check then decides.
   *
   * ```ts
   * LiteralSchemaEmitter._emitCoercion({ schema: <pvl.literal(1)>, target: { value: 'field0', path, issuePath } })
   * // 'if (typeof field0 === "string" || typeof field0 === "boolean") {\n  field0 = Number(field0);\n}'
   * ```
   */
  public static override _emitCoercion({
    schema,
    target: { value },
  }: EmitCoercionArgs<LiteralSchema>): EmittedCoercion {
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
      issueCode: ISSUE_CODE.INVALID_VALUE,
    });
  }

  /**
   * The literal value's own type.
   *
   * ```ts
   * LiteralSchemaEmitter._spellFactoryTypes({ schema: <pvl.literal('a')> }) // { input: { text: '"a"', undefinedness: 'NEVER' }, output: <the same> }
   * ```
   */
  public static override _spellFactoryTypes({
    schema,
  }: SpellTypesArgs<LiteralSchema>): SchemaTypes {
    const type: SpelledType = {
      text: spellLiteralType(schema.value),
      undefinedness: UNDEFINEDNESS.NEVER,
    };
    return { input: type, output: type };
  }
}
