// The config file's name and every setting's default.

/** The file name the compiler looks for in the working directory. */
export const CONFIG_FILE_NAME = 'pvlconfig.json' as const;

/** The `include` setting's default. */
export const DEFAULT_INCLUDE = ['src/schemas/**/*.ts'] as const;

/** The `rootDir` setting's default. */
export const DEFAULT_ROOT_DIR = 'src' as const;

/** The `withTypes` setting's default. */
export const DEFAULT_WITH_TYPES = true as const;

/** The `watch` setting's default. */
export const DEFAULT_WATCH = false as const;
