// Helpers with no better home; internal, so outside the barrel.
import fs from 'node:fs/promises';

/** The message of a caught value, which may not be an `Error`. */
export const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

/**
 * A copy of `record` without the keys set to `undefined`, which means "not set", so a
 * caller can pass every optional value through whether or not it was given.
 *
 * ```ts
 * definedOnly({ destination: 'out', rootDir: undefined }) // { destination: 'out' }
 * definedOnly({ withTypes: false })                       // { withTypes: false }: only `undefined` is dropped
 * definedOnly({ include: undefined })                     // {}
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
 * What `stat` says about `path`, or `undefined` when nothing is there (or it can't be read).
 *
 * ```ts
 * await statOrUndefined('/repo')        // Stats: a directory
 * await statOrUndefined('/repo/absent') // undefined
 * ```
 */
export const statOrUndefined = async (
  path: string,
): Promise<Awaited<ReturnType<typeof fs.stat>> | undefined> => {
  try {
    return await fs.stat(path);
  } catch {
    return undefined;
  }
};
