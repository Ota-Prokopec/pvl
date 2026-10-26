// The constants the Emitters use: the types they spell for a Modifier.
import { UNDEFINEDNESS } from '../enums.js';
import type { SpelledType } from '../schemas/schemaTypes.js';

/** The Input of a coerced Schema, which takes any value. */
export const UNKNOWN_TYPE: SpelledType = { text: 'unknown', undefinedness: UNDEFINEDNESS.ALWAYS };
