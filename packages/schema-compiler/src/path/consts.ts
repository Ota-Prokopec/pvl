// The suffixes a declaration file's name ends with.

/** Declaration file suffixes, each read as one extension so `types.d.ts` isn't left as `types.d`. */
export const DECLARATION_FILE_SUFFIXES = ['.d.ts', '.d.mts', '.d.cts'] as const;
