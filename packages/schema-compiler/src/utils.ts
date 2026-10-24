// Helpers with no better home; internal, so outside the barrel.
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import { minimatch } from 'minimatch';

/** The message of a caught value, which may not be an `Error`. */
export const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

/**
 * A copy of `record` without the keys set to `undefined`, which means "not set", so a
 * caller can pass every optional value through whether or not it was given.
 *
 * ```ts
 * definedOnlyKeys({ destination: 'out', rootDir: undefined }) // { destination: 'out' }
 * definedOnlyKeys({ withTypes: false })                       // { withTypes: false }: only `undefined` is dropped
 * definedOnlyKeys({ include: undefined })                     // {}
 * ```
 */
export const definedOnlyKeys = <T extends object>(
  record: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } => {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
};

/**
 * What `stat` says about `filePath`, or `undefined` when nothing is there (or it can't be read).
 *
 * ```ts
 * await statOrUndefined('/repo')        // Stats: a directory
 * await statOrUndefined('/repo/absent') // undefined
 * ```
 */
export const statOrUndefined = async (
  filePath: string,
): Promise<Awaited<ReturnType<typeof fsPromises.stat>> | undefined> => {
  try {
    return await fsPromises.stat(filePath);
  } catch {
    return undefined;
  }
};

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
