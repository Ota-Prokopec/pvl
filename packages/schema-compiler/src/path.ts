// A file's or directory's location: its absolute path, and its path relative
// to a base directory when the mirror places it against one, plus the
// helpers that read and respell a file path.
import * as path from 'node:path';

/** Declaration file suffixes, each read as one extension so `types.d.ts` isn't left as `types.d`. */
const DECLARATION_FILE_SUFFIXES = ['.d.ts', '.d.mts', '.d.cts'] as const;

/** Where a file or directory is, by its absolute path. */
export type AbsolutePath<TAbsolutePath extends string = string> = {
  /** Its absolute path. */
  readonly absolutePath: TAbsolutePath;
};

/** Where a file or directory is, by its absolute path and its path relative to a base directory. */
export type AbsolutePathWithRelative<TAbsolutePath extends string = string> =
  AbsolutePath<TAbsolutePath> & {
    /** Its path relative to a base directory. */
    readonly relative: {
      /** The base directory's absolute path. */
      readonly absoluteBase: string;
      /** `absolutePath` relative to `absoluteBase`, with `/` separators. */
      readonly path: string;
    };
  };

/**
 * `absolutePath` with its path relative to `absoluteBase`, keeping the type
 * `absolutePath` has, so a branded path stays branded.
 *
 * ```ts
 * createAbsolutePathWithRelative('/repo/.pvl', '/repo')
 * // { absolutePath: '/repo/.pvl', relative: { absoluteBase: '/repo', path: '.pvl' } }
 * createAbsolutePathWithRelative('/repo/src/schemas/user.ts', '/repo/src')
 * // { …, relative: { absoluteBase: '/repo/src', path: 'schemas/user.ts' } }: `/` separators on Windows too
 * ```
 */
export const createAbsolutePathWithRelative = <TAbsolutePath extends string>(
  absolutePath: TAbsolutePath,
  absoluteBase: string,
): AbsolutePathWithRelative<TAbsolutePath> => {
  return {
    absolutePath,
    relative: { absoluteBase, path: toPosixPath(path.relative(absoluteBase, absolutePath)) },
  };
};

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
 * Whether `filePath` is a declaration file, which holds only types.
 *
 * ```ts
 * isDeclarationFile('schemas/types.d.ts')  // true
 * isDeclarationFile('schemas/types.d.mts') // true
 * isDeclarationFile('schemas/user.ts')     // false
 * ```
 */
export const isDeclarationFile = (filePath: string): boolean => {
  return DECLARATION_FILE_SUFFIXES.some((suffix) => filePath.endsWith(suffix));
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
