// Each setting's default, which the config resolver and the Destination
// Directory fall back on. Internal: the barrel leaves config/defaults/ out, so
// semver doesn't bind them.

/** The `include` setting's default. */
export const DEFAULT_INCLUDE = ['src/schemas/**/*.ts'] as const;

/** The `rootDir` setting's default. */
export const DEFAULT_ROOT_DIR = 'src' as const;

/** The `withTypes` setting's default. */
export const DEFAULT_WITH_TYPES = true as const;

/** The `watch` setting's default. */
export const DEFAULT_WATCH = false as const;

/** Where the Destination Directory goes, relative to the base directory, when `destination` is unset. */
export const DEFAULT_DESTINATION_DIRECTORY = '.pvl' as const;
