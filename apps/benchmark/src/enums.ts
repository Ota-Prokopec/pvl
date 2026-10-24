// The fixed set of named values the benchmark uses: the variants it compares.
import type { ValueOfEnum } from '@repo/types';

/** The variants the benchmark compares, valued by the id a worker of the isolated runner gets on its command line. */
export const VARIANT = {
  V1: 'v1',
  V2: 'v2',
  V3: 'v3',
} as const;

export type Variant = ValueOfEnum<typeof VARIANT>;
