// The types a Frame composes a Schema's checks with.
import type {
  EmittedCoercion,
  EmittedShortCircuitCondition,
} from '../emitters/types/emittedText.js';

/** A Schema's pre-modifier step as grouped: a conversion, which replaces the value before what follows it, or the conditions chained one after another, whose one guard what follows runs behind. */
export type GroupedPreModifierStep =
  { coercion: EmittedCoercion } | { conditions: EmittedShortCircuitCondition[] };
