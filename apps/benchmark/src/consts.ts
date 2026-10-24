// The constants both runners share: each variant's name in the printed
// tables, and the unit times are converted with.
import { VARIANT, type Variant } from './enums.js';

/** Each variant's name in the printed tables. */
export const VARIANT_LABEL = {
  [VARIANT.V1]: 'V1 inline',
  [VARIANT.V2]: 'V2 per-composite',
  [VARIANT.V3]: 'V3 per-key',
} as const satisfies Record<Variant, string>;

export const NANOSECONDS_PER_MILLISECOND = 1e6 as const;
