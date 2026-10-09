// A file's or directory's location: its absolute path and, when it is known
// against a base directory, its path relative to that base.
import * as path from 'node:path';
import { toPosixPath } from './mirror/utils.js';

/** Where a file or directory is. */
export type Path = {
  /** Its absolute path. */
  absolutePath: string;
  /** Its path relative to a base directory, when one is known. */
  relative?: {
    /** The base directory's absolute path. */
    absoluteBase: string;
    /** `absolutePath` relative to `absoluteBase`, with `/` separators. */
    path: string;
  };
};

/**
 * The `Path` of `absolutePath`, with its path relative to `absoluteBase`. A
 * `Path` without a base needs no helper: it is `{ absolutePath }`.
 *
 * ```ts
 * toPath('/repo/.pvl', '/repo')
 * // { absolutePath: '/repo/.pvl', relative: { absoluteBase: '/repo', path: '.pvl' } }
 * toPath('/repo/src/schemas/user.ts', '/repo/src')
 * // { …, relative: { absoluteBase: '/repo/src', path: 'schemas/user.ts' } }: `/` separators on Windows too
 * ```
 */
export const toPath = (absolutePath: string, absoluteBase: string): Required<Path> => {
  return {
    absolutePath,
    relative: {
      absoluteBase,
      path: toPosixPath(path.relative(absoluteBase, absolutePath)),
    },
  };
};
