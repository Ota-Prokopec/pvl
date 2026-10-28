// The pure functions `Scanner.scan` reports what `include` raises with: the
// patterns that reach the Destination Directory, and the diagnostics for
// those, for a symlink it matched and for an `include` that matched no file.
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import type { Destination } from '../destination/destination.js';
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';

/**
 * The glob `patterns` that match `relativePath` or could match anything inside
 * it, in their given order. Both are POSIX-separated and relative to the same
 * base; each pattern is normalized first, so `./src/**` and `src/**` agree.
 *
 * ```ts
 * findPatternsMatchingPath(['src/**\/*.ts', 'lib/*.ts'], 'src/compiled') // ['src/**\/*.ts']
 * findPatternsMatchingPath(['../shared/**'], '../shared/out')           // ['../shared/**']
 * findPatternsMatchingPath(['src/schemas/**\/*.ts'], '.pvl')             // []
 * ```
 */
export const findPatternsMatchingPath = (
  patterns: ReadonlyArray<string>,
  relativePath: string,
): string[] => {
  // `partial`: the pattern matches `relativePath` or could match something inside it.
  return patterns.filter((pattern) =>
    minimatch(relativePath, path.posix.normalize(pattern), { partial: true }),
  );
};

/**
 * The DESTINATION_INSIDE_INCLUDE diagnostic for an `include` pattern that
 * matches the Destination Directory or anything inside it, so the compiler
 * would scan its own output.
 *
 * ```ts
 * // include: ['src/**\/*.ts'], destination: 'src/compiled'
 * createDestinationInsideIncludeDiagnostic(destination, 'src/**\/*.ts') // DESTINATION_INSIDE_INCLUDE
 * ```
 */
export const createDestinationInsideIncludeDiagnostic = (
  destination: Destination,
  pattern: string,
): Diagnostic => {
  return new Diagnostic({
    code: DIAGNOSTIC_CODE.DESTINATION_INSIDE_INCLUDE,
    message: `The destination ${destination.relativePath.pathFromBase} matches the include pattern \`${pattern}\`, so the compiler would read its own output. Move the destination out of it, or narrow include.`,
    file: destination.absolutePath,
  });
};

/**
 * The `NO_INPUT_FILES` error a run reports when `include` matched no file,
 * listing every pattern.
 *
 * ```ts
 * createNoInputFilesDiagnostic(['src/*.ts', 'lib/*.ts'])
 * // message: 'include matched no file: `src/*.ts`, `lib/*.ts`.'
 * ```
 */
export const createNoInputFilesDiagnostic = (include: ReadonlyArray<string>): Diagnostic => {
  return new Diagnostic({
    code: DIAGNOSTIC_CODE.NO_INPUT_FILES,
    message: `include matched no file: ${include.map((pattern) => `\`${pattern}\``).join(', ')}.`,
  });
};

/**
 * The SYMLINK_SKIPPED warning for a symlink `include` matched, which the
 * compiler doesn't follow, whether it points to a file, a directory or
 * nothing.
 *
 * ```ts
 * createSymlinkSkippedDiagnostic('/repo/src/schemas/linked.ts')
 * // → SYMLINK_SKIPPED: This file is a symlink, which the compiler doesn't follow, so it isn't mirrored and its pvl.compile(...) calls aren't compiled.
 * ```
 */
export const createSymlinkSkippedDiagnostic = (symlinkPath: string): Diagnostic => {
  return new Diagnostic({
    code: DIAGNOSTIC_CODE.SYMLINK_SKIPPED,
    message:
      "This file is a symlink, which the compiler doesn't follow, so it isn't mirrored and its pvl.compile(...) calls aren't compiled.",
    file: symlinkPath,
  });
};
