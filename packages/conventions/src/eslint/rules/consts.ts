/** The constants the rules read. */

/** The only `.env*` file names `env-file-names` allows. */
export const ALLOWED_ENV_FILE_NAMES = new Set(['.env.production', '.env.development']);

/** The directories `env-file-names` doesn't search for `.env*` files. */
export const ENV_FILE_SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.turbo', '.git']);
