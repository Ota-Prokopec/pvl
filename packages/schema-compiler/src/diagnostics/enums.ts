// The diagnostics' fixed sets of named values, public API: the code each
// diagnostic carries and how serious it is.
import type { ValueOfEnum } from '@repo/types';

/**
 * Every code a diagnostic can carry. Codes are stable across releases, so
 * assert on or filter by a code, never by a message's wording.
 *
 * @example
 * ```ts
 * import { runCompilation, DIAGNOSTIC_CODE } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await runCompilation({ cwd: process.cwd() });
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
  /** `include` matched a symlink, or a file through a symlinked directory, which the compiler doesn't follow, so nothing reached through it is mirrored or compiled (a warning). */
  SYMLINK_SKIPPED: 'SYMLINK_SKIPPED',
  /** The destination is a file, or can't be created or written. */
  DESTINATION_UNWRITABLE: 'DESTINATION_UNWRITABLE',
  /** The destination holds files the compiler didn't write, so it won't be replaced. */
  DESTINATION_NOT_EMPTY: 'DESTINATION_NOT_EMPTY',
  /** `include` would match the Destination Directory, so the compiler would read its own output. */
  DESTINATION_INSIDE_INCLUDE: 'DESTINATION_INSIDE_INCLUDE',
  /** `<baseDirectory>/tsconfig.json` can't be read or parsed, or names a file it extends that can't be, so alias imports can't be resolved. */
  TSCONFIG_UNREADABLE: 'TSCONFIG_UNREADABLE',
  /** A scanned file isn't valid syntax, so it can't be mirrored. */
  PARSE_FAILED: 'PARSE_FAILED',
  /** A scanned file isn't under `rootDir`, so it has no place in the mirror. */
  FILE_OUTSIDE_ROOT_DIR: 'FILE_OUTSIDE_ROOT_DIR',
  /** A scanned file has a default export (`export default`, `export =`, `export { x as default }`), whatever it exports, which is mirrored as written: export it under a name instead (a warning, one per statement). */
  DEFAULT_EXPORT: 'DEFAULT_EXPORT',
  /** A side-effecting top-level statement was copied, so it runs again wherever the mirror is loaded (a warning). */
  SIDE_EFFECT_COPIED: 'SIDE_EFFECT_COPIED',
  /** A scanned file has no export (a warning). */
  FILE_EXPORTS_NOTHING: 'FILE_EXPORTS_NOTHING',
  /** A `pvl.compile(...)` argument, or a factory's argument in it, can't be read statically: it isn't a `pvl.*` call chain, a literal or a top-level `const` holding one, of the same file or imported; or an argument of a method chained in it is spread. */
  COMPILE_ARGUMENT_UNRESOLVABLE: 'COMPILE_ARGUMENT_UNRESOLVABLE',
  /** A `pvl.compile(...)` argument, or a factory's argument in it, follows a `const` that refers back to itself, so reading it would never end. */
  COMPILE_ARGUMENT_CYCLE: 'COMPILE_ARGUMENT_CYCLE',
  /** A Schema `pvl.compile(...)` reads from another file passes a Runtime Argument written there, which can't be evaluated in this one. */
  RUNTIME_ARGUMENT_IN_IMPORTED_SCHEMA: 'RUNTIME_ARGUMENT_IN_IMPORTED_SCHEMA',
  /** Something is chained onto the result of `pvl.compile(...)`, which takes no Modifier: chain it inside the call. */
  COMPILE_RESULT_MODIFIED: 'COMPILE_RESULT_MODIFIED',
  /** A `pvl.compile(...)` argument uses something the compiler can't compile yet, such as a union, or calls a method `@pvl/schema` doesn't have, which ends the reading, so only the first is reported. */
  UNSUPPORTED_SCHEMA: 'UNSUPPORTED_SCHEMA',
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
 * import { runCompilation, SEVERITY } from '@pvl/schema-compiler';
 *
 * const { diagnostics } = await runCompilation({ cwd: process.cwd() });
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
