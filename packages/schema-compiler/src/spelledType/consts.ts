// The types the Emitters spell for a Modifier.
import { UNDEFINEDNESS } from '../enums.js';
import type { SpelledType } from './types.js';

/** The Input of a coerced Schema, which takes any value. */
export const UNKNOWN_SPELLED_TYPE: SpelledType = {
  text: 'unknown',
  undefinedness: UNDEFINEDNESS.ALWAYS,
};
