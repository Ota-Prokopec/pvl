// What a module specifier written in a scanned module reaches, as the mirror sees it.
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
