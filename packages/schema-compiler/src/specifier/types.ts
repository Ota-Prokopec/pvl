// What a module specifier reaches, as `Module` resolves it and
// `Specifier.rewrite` respells it toward.
import type { AbsolutePath } from '../path/types.js';
import type { SPECIFIER_TARGET_KIND } from './enums.js';

/** What a module specifier reaches, resolved from where it was written. */
export type SpecifierTarget =
  | {
      kind: typeof SPECIFIER_TARGET_KIND.MIRRORED | typeof SPECIFIER_TARGET_KIND.REPOSITORY;
      /** The mirrored module of a scanned file, or the unscanned original file. */
      path: AbsolutePath;
    }
  | { kind: typeof SPECIFIER_TARGET_KIND.UNRESOLVED };
