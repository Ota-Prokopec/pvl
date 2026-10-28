// The helpers that respell a file path: with `/` separators, and without its
// extension.
import * as path from 'node:path';
import { DECLARATION_FILE_SUFFIXES } from './consts.js';

/**
 * `filePath` with the platform's separators replaced by `/`, so the mirror
 * and the diagnostics read the same on Windows as elsewhere.
 *
 * ```ts
 * toPosixPath('src\\schemas\\user.ts') // 'src/schemas/user.ts' on Windows
 * toPosixPath('src/schemas/user.ts')   // unchanged on macOS and Linux
 * ```
 */
export const toPosixPath = (filePath: string): string => {
  return filePath.split(path.sep).join(path.posix.sep);
};

/**
 * `filePath` without its extension, a declaration file's whole `.d.ts`
 * included.
 *
 * ```ts
 * stripFileExtension('/repo/src/lib/helpers.ts') // '/repo/src/lib/helpers'
 * stripFileExtension('/repo/src/lib/types.d.ts') // '/repo/src/lib/types'
 * stripFileExtension('/repo/src/data.json')      // '/repo/src/data'
 * ```
 */
export const stripFileExtension = (filePath: string): string => {
  const declarationFileSuffix = DECLARATION_FILE_SUFFIXES.find((suffix) =>
    filePath.endsWith(suffix),
  );
  const extension = declarationFileSuffix ?? path.extname(filePath);
  return filePath.slice(0, filePath.length - extension.length);
};
