// Whether a spelled type admits `undefined`.
import type { ValueOfEnum } from '@repo/types';

/** Whether a spelled type admits `undefined`, which decides whether an object key of that type may be left out. */
export const UNDEFINEDNESS = {
  /** It never does: `string`. */
  NEVER: 'NEVER',
  /** It always does: `string | undefined`, `unknown`. */
  ALWAYS: 'ALWAYS',
  /** It does when a type parameter does, which only TypeScript decides once it is inferred: a `.transform()`'s `TArg0Output`. */
  CONDITIONAL: 'CONDITIONAL',
} as const;

export type Undefinedness = ValueOfEnum<typeof UNDEFINEDNESS>;
