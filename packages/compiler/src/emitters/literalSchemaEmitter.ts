// The code a `LiteralSchema` compiles to: its value check, as it has no
// Constraint, and `.coerce()`, held in its `preModifierSteps` table, which
// converts as the primitive of its value does.
import {
  ISSUE_CODE,
  LITERAL_SCHEMA_ISSUE_MESSAGE,
  type LiteralInterpretedSchema,
  type PossibleLiteralValue,
} from '@pcvl/schema';
import type { LiteralSchema } from '../schemas/literalSchema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmittedCheck } from './types/emittedText.js';
import type { SpellTypesArgs } from './types/hookArgs.js';
import type { EmitterMethodOf, PreModifierStepTable } from './types/methodTables.js';
import type { EmittedPreModifierStep } from './types/schemaParts.js';
import {
  emitCoerceToBigint,
  emitCoerceToBoolean,
  emitCoerceToNumber,
  emitCoerceToString,
} from './utils/coercions.js';
import { emitTypeCheck } from './utils/emittedText.js';
import { js } from './utils/js.js';
import { emitLiteral, spellLiteralType } from './utils/literal.js';
import type { EmitBaseCheckArgs } from './schemaEmitter.js';
import type { SchemaTypes, SpelledType } from '../spelledType/types.js';
import { UNDEFINEDNESS } from '../spelledType/enums.js';

/**
 * `.coerce()` → the conversion of the primitive its value is, so the value
 * check then decides.
 *
 * ```ts
 * coerce({ schema: <pvl.literal(1)>, target: { value: 'field0', path, issuePath }, … })
 * // { coercion: 'if (typeof field0 === "string" || typeof field0 === "boolean") {\n  field0 = Number(field0);\n}' }
 * ```
 */
const coerce: EmitterMethodOf<
  LiteralInterpretedSchema<PossibleLiteralValue>['coerce'],
  EmittedPreModifierStep,
  LiteralSchema
> = ({ schema, target: { value } }) => {
  // By the type of its value, as `LiteralInterpretedSchema.coerce` picks it.
  switch (typeof schema.value) {
    case 'string':
      return { coercion: emitCoerceToString(value) };
    case 'number':
      return { coercion: emitCoerceToNumber(value) };
    case 'boolean':
      return { coercion: emitCoerceToBoolean(value) };
    default:
      return { coercion: emitCoerceToBigint(value) };
  }
};

export class LiteralSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly preModifierSteps = {
    ...ChainableSchemaEmitter.preModifierSteps,
    coerce,
  } satisfies PreModifierStepTable<LiteralSchema>;

  /**
   * `pvl.literal('a')` → `!Object.is(field0, "a")`, reporting
   * `INVALID_VALUE`. `Object.is`, as the interpreted check uses, so `0` and
   * `-0` stay apart.
   */
  public static _emitBaseCheck({
    target: { value, issuePath },
    schema: { value: literalValue },
  }: EmitBaseCheckArgs<LiteralSchema>): EmittedCheck {
    return emitTypeCheck({
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
