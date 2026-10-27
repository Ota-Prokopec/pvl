// The methods setting how an object treats its undeclared keys, which both
// its Schema and its Emitter read.
import { PVL_SCHEMA_UNKNOWN_KEYS_METHOD_NAMES_ENUM } from '@pvl/schema';

/** The methods setting how an object treats the keys its shape doesn't declare, the last of them chained winning (ADR-0007). */
export const UNKNOWN_KEYS_METHOD_NAMES: ReadonlySet<string> = new Set(
  Object.values(PVL_SCHEMA_UNKNOWN_KEYS_METHOD_NAMES_ENUM),
);
