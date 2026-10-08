// Every diagnostic code, the severities, and which severity each code is
// raised with.
import type { ValueOfEnum } from '@repo/types';

/**
 * Every code a diagnostic can carry. Codes are stable across releases, so
 * assert on or filter by a code, never by a message's wording.
 *
 * @example
 * ```ts
 * import { compile, DIAGNOSTIC_CODE } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await compile({ cwd: process.cwd() });
 * const noConfig = diagnostics.some((d) => d.code === DIAGNOSTIC_CODE.NO_CONFIG);
 * ```
 */
export const DIAGNOSTIC_CODE = {
  /** No `pvlconfig.json` was found and no setting was passed as a flag. */
  NO_CONFIG: 'NO_CONFIG',
  /** The config file could not be read, or is not valid JSON. */
  CONFIG_UNREADABLE: 'CONFIG_UNREADABLE',
  /** A setting, from the config file or a flag, fails the config's schema. */
  INVALID_CONFIG: 'INVALID_CONFIG',
  /** `include` matched no file. */
  NO_INPUT_FILES: 'NO_INPUT_FILES',
  /** The destination is a file, or can't be created or written. */
  DESTINATION_UNWRITABLE: 'DESTINATION_UNWRITABLE',
  /** The destination holds files the compiler didn't write, so it won't be replaced. */
  DESTINATION_NOT_EMPTY: 'DESTINATION_NOT_EMPTY',
  /** `include` would match the Destination Directory, so the compiler would read its own output. */
  DESTINATION_INSIDE_INCLUDE: 'DESTINATION_INSIDE_INCLUDE',
  /** Two scanned files export the same name bound to different things, so the barrel can't re-export both. */
  DUPLICATE_EXPORT: 'DUPLICATE_EXPORT',
  /** A scanned file isn't valid syntax, so it can't be mirrored. */
  PARSE_FAILED: 'PARSE_FAILED',
  /** A scanned file isn't under `rootDir`, so it has no place in the mirror. */
  FILE_OUTSIDE_ROOT_DIR: 'FILE_OUTSIDE_ROOT_DIR',
  /** A scanned file has a default export; export it by name instead. */
  DEFAULT_EXPORT: 'DEFAULT_EXPORT',
  /** A side-effecting top-level statement was copied, so it runs again wherever the mirror is loaded (a warning). */
  SIDE_EFFECT_COPIED: 'SIDE_EFFECT_COPIED',
  /** A scanned file has no export (a warning). */
  FILE_EXPORTS_NOTHING: 'FILE_EXPORTS_NOTHING',
  /** The CLI was given an unknown flag, a flag value of the wrong type, or no command. */
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
} as const;

/**
 * One of {@link DIAGNOSTIC_CODE}'s values.
 *
 * @example
 * ```ts
 * import type { DiagnosticCode } from '@pvl/schema-compiler';
 *
 * const code: DiagnosticCode = 'NO_CONFIG';
 * ```
 */
export type DiagnosticCode = ValueOfEnum<typeof DIAGNOSTIC_CODE>;

/**
 * How serious a diagnostic is. Any `ERROR` stops the Destination Directory from
 * being written; a `WARNING` doesn't, unless the run is strict.
 *
 * @example
 * ```ts
 * import { compile, SEVERITY } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await compile({ cwd: process.cwd() });
 * const failed = diagnostics.some((d) => d.severity === SEVERITY.ERROR);
 * ```
 */
export const SEVERITY = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
} as const;

/**
 * One of {@link SEVERITY}'s values.
 *
 * @example
 * ```ts
 * import type { Severity } from '@pvl/schema-compiler';
 *
 * const severity: Severity = 'WARNING';
 * ```
 */
export type Severity = ValueOfEnum<typeof SEVERITY>;

/**
 * The severity each code is raised with, before `strict` promotes warnings.
 *
 * @example
 * ```ts
 * import { DIAGNOSTIC_SEVERITY } from '@pvl/schema-compiler';
 *
 * DIAGNOSTIC_SEVERITY.FILE_EXPORTS_NOTHING; // 'WARNING'
 * ```
 */
export const DIAGNOSTIC_SEVERITY = {
  NO_CONFIG: SEVERITY.ERROR,
  CONFIG_UNREADABLE: SEVERITY.ERROR,
  INVALID_CONFIG: SEVERITY.ERROR,
  NO_INPUT_FILES: SEVERITY.ERROR,
  DESTINATION_UNWRITABLE: SEVERITY.ERROR,
  DESTINATION_NOT_EMPTY: SEVERITY.ERROR,
  DESTINATION_INSIDE_INCLUDE: SEVERITY.ERROR,
  DUPLICATE_EXPORT: SEVERITY.ERROR,
  PARSE_FAILED: SEVERITY.ERROR,
  FILE_OUTSIDE_ROOT_DIR: SEVERITY.ERROR,
  DEFAULT_EXPORT: SEVERITY.ERROR,
  FILE_EXPORTS_NOTHING: SEVERITY.WARNING,
  SIDE_EFFECT_COPIED: SEVERITY.WARNING,
  INVALID_ARGUMENTS: SEVERITY.ERROR,
} as const satisfies Record<DiagnosticCode, Severity>;
