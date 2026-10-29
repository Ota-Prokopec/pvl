// A file's or directory's location placed against a base directory, and
// whether it lies outside that base.
import * as path from 'node:path';
import type { AbsolutePathWithRelative } from './types.js';
import { toPosixPath } from './utils.js';

/**
 * `absolutePath` with its path relative to `absoluteBase`, keeping the type
 * `absolutePath` has, so a branded path stays branded.
 *
 * ```ts
 * createAbsolutePathWithRelative('/repo/.pvl', '/repo')
 * // { absolutePath: '/repo/.pvl', relativePath: { absoluteBase: '/repo', pathFromBase: '.pvl' } }
 * createAbsolutePathWithRelative('/repo/src/schemas/user.ts', '/repo/src')
 * // { …, relativePath: { absoluteBase: '/repo/src', pathFromBase: 'schemas/user.ts' } }: `/` separators on Windows too
 * ```
 */
export const createAbsolutePathWithRelative = <TAbsolutePath extends string>(
  absolutePath: TAbsolutePath,
  absoluteBase: string,
): AbsolutePathWithRelative<TAbsolutePath> => {
  return {
    absolutePath,
    relativePath: {
      absoluteBase,
      pathFromBase: toPosixPath(path.relative(absoluteBase, absolutePath)),
    },
  };
};

/**
 * Whether `relativePath` leads outside its base directory: up out of it, or
 * to another drive, where no relative path reaches.
 *
 * ```ts
 * isOutsideBase({ …, relativePath: { absoluteBase: '/repo/src', pathFromBase: 'schemas/user.ts' } })   // false
 * isOutsideBase({ …, relativePath: { absoluteBase: '/repo/src', pathFromBase: '../lib/helpers.ts' } }) // true
 * isOutsideBase({ …, relativePath: { absoluteBase: 'C:\\repo', pathFromBase: 'D:/lib/helpers.ts' } })  // true on Windows: another drive
 * ```
 */
export const isOutsideBase = ({
  relativePath: { pathFromBase },
}: AbsolutePathWithRelative): boolean => {
  return pathFromBase === '..' || pathFromBase.startsWith('../') || path.isAbsolute(pathFromBase);
};
