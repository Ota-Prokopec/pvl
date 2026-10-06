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
  /** The destination is a directory, or can't be created or written. */
  DESTINATION_UNWRITABLE: 'DESTINATION_UNWRITABLE',
  /** `include` would match the Destination File, so the compiler would read its own output. */
  DESTINATION_INSIDE_INCLUDE: 'DESTINATION_INSIDE_INCLUDE',
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
 * How serious a diagnostic is. Any `ERROR` stops the Destination File from
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
  DESTINATION_INSIDE_INCLUDE: SEVERITY.ERROR,
  FILE_EXPORTS_NOTHING: SEVERITY.WARNING,
  INVALID_ARGUMENTS: SEVERITY.ERROR,
} as const satisfies Record<DiagnosticCode, Severity>;
