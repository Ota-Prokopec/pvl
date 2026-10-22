// The code the Shared Modifiers of `ChainableInterpretedSchema` compile to, one method
// per pre-modifier it mirrors, held in its `shortCircuitConditions` table.
// Each returns the condition under which a value short-circuits, since a
// value it accepts skips every later check. Every schema's emitter extends
// it, as every schema extends `ChainableInterpretedSchema`.
import type { ChainableInterpretedSchema } from '@pvl/schema';
import type { SchemaModifierCall } from '../schemas/schemaTypes.js';
import { Emitter, type SpellTypesArgs } from './emitter.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import type {
  EmittedShortCircuitCondition,
  EmitterMethodOf,
  ShortCircuitConditionTable,
} from './emittersTypes.js';
import { emitShortCircuitCondition, js } from './emitterUtils.js';

/**
 * `type` with `| undefined` or `| null` added for each `.optional()` and
 * `.nullable()` in `calls`, in chain order.
 *
 * ```ts
 * widenType('string', [nullable(), optional()]) // 'string | null | undefined'
 * widenType('string', [min(3)])                 // 'string'
 * ```
 */
const widenType = (type: string, calls: ReadonlyArray<SchemaModifierCall>): string => {
  return calls.reduce(
    (widened, call) =>
      call.name === 'optional'
        ? `${widened} | undefined`
        : call.name === 'nullable'
          ? `${widened} | null`
          : widened,
    type,
  );
};

/** `.optional()` → `field0 === undefined`, which short-circuits. */
const optional: EmitterMethodOf<
  ChainableInterpretedSchema['optional'],
  EmittedShortCircuitCondition
> = ({ target: { value } }) =>
  emitShortCircuitCondition({ acceptsWhen: js`${value} === undefined` });

/** `.nullable()` → `field0 === null`, which short-circuits. */
const nullable: EmitterMethodOf<
  ChainableInterpretedSchema['nullable'],
  EmittedShortCircuitCondition
> = ({ target: { value } }) => emitShortCircuitCondition({ acceptsWhen: js`${value} === null` });

export class ChainableSchemaEmitter extends Emitter {
  public static override readonly shortCircuitConditions = {
    ...Emitter.shortCircuitConditions,
    optional,
    nullable,
  } satisfies ShortCircuitConditionTable;

  /**
   * The factory call's types, with `| undefined` or `| null` added for each
   * `.optional()` and `.nullable()`, in chain order.
   *
   * ```ts
   * StringSchemaEmitter._spellTypes({ schema: <pvl.string().nullable().optional()> })
   * // { input: 'string | null | undefined', output: <the same> }
   * ```
   */
  public static override _spellTypes(args: SpellTypesArgs): SchemaTypes {
    const { input, output } = super._spellTypes(args);
    const { preModifierCalls: calls } = args.schema;
    return { input: widenType(input, calls), output: widenType(output, calls) };
  }
}
