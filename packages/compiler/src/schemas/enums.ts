// The read Schemas' enums: how an object treats the keys its shape doesn't declare.
import type { ValueOfEnum } from '@repo/types';

/** How an object treats the keys its shape doesn't declare: its unknown-key mode, set by the last of `.strict()` and `.passthrough()` chained (ADR-0007). */
export const UNKNOWN_KEYS_MODE = {
  /** Neither is chained: they are left off the output. */
  STRIP: 'STRIP',
  /** `.strict()` wins: each is reported as an `UNRECOGNIZED_KEY` Issue. */
  STRICT: 'STRICT',
  /** `.passthrough()` wins: they are kept on the output. */
  PASSTHROUGH: 'PASSTHROUGH',
} as const;

export type UnknownKeysMode = ValueOfEnum<typeof UNKNOWN_KEYS_MODE>;
