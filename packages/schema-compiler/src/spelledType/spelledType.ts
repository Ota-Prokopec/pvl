// How a spelled type is widened by the Modifiers chained onto its Schema.
import { PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM } from '@pvl/schema';
import { UNDEFINEDNESS } from './enums.js';
import type { SchemaModifierCall } from '../schemas/types/modifierCall.js';
import type { SpelledType } from './types.js';

/**
 * `type` with `| undefined` or `| null` added for each `.optional()` and
 * `.nullable()` in `calls`, in chain order, admitting `undefined` once an
 * `.optional()` is.
 *
 * ```ts
 * widenType({ text: 'string', undefinedness: 'NEVER' }, [nullable(), optional()]) // { text: 'string | null | undefined', undefinedness: 'ALWAYS' }
 * widenType({ text: 'string', undefinedness: 'NEVER' }, [min(3)])                 // { text: 'string', undefinedness: 'NEVER' }
 * ```
 */
export const widenType = (
  type: SpelledType,
  calls: ReadonlyArray<SchemaModifierCall>,
): SpelledType => {
  return calls.reduce(
    (widened, call): SpelledType =>
      call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.OPTIONAL
        ? { text: `${widened.text} | undefined`, undefinedness: UNDEFINEDNESS.ALWAYS }
        : call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.NULLABLE
          ? { ...widened, text: `${widened.text} | null` }
          : widened,
    type,
  );
};
