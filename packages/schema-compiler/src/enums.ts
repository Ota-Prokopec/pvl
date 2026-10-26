// The fixed sets of named values the compiler uses internally: whether a
// spelled type admits `undefined`, what a module specifier reaches, and how
// an object treats the keys its shape doesn't declare. The
// diagnostics' own are in `diagnostics/enums.ts`; the factory and method names
// come from `@pvl/schema`.
import type { ValueOfEnum } from '@repo/types';

/** What a module specifier written in a scanned module reaches, as the mirror sees it. */
export const SPECIFIER_TARGET_KIND = {
  /** A scanned file, so its mirrored module. */
  MIRRORED: 'MIRRORED',
  /** An application file that wasn't scanned, so the original file. */
  REPOSITORY: 'REPOSITORY',
  /** A package, or nothing at all. */
  UNRESOLVED: 'UNRESOLVED',
} as const;

export type SpecifierTargetKind = ValueOfEnum<typeof SPECIFIER_TARGET_KIND>;

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
