// The config's public types: the settings a run uses, the config file's
// contents, and the overrides that win over it.
import type { InferOutput } from '@pvl/schema';
import type { pvlConfigFilePayloadSchema } from './configValidationSchemas.js';

/**
 * Every setting the compiler runs with, once the overrides, the config file
 * and the defaults are merged. Relative paths are relative to the base
 * directory: the directory holding `pvlconfig.json`, or the working directory
 * without one.
 *
 * @example
 * ```ts
 * import { runCompilation } from '@pvl/schema-compiler';
 *
 * const { settings } = await runCompilation({ cwd: process.cwd() });
 * settings?.include; // ['src/schemas/**\/*.ts'] unless configured
 * ```
 */
export type PvlConfig = {
  /** Globs selecting the files to scan. `node_modules` and the destination are never scanned. */
  include: string[];
  /** The Root Directory: the source root the Destination Directory mirrors, which every scanned file sits under. */
  rootDir: string;
  /** The Destination Directory's path; unset means the default `.pvl` directory. */
  destination: string | undefined;
  /** Whether to generate a type alias for each Schema's input and output. */
  withTypes: boolean;
};

/**
 * The contents of a valid `pvlconfig.json`: every key it may set, each optional.
 *
 * @example
 * ```ts
 * import type { PvlConfigFilePayload } from '@pvl/schema-compiler';
 *
 * const file: PvlConfigFilePayload = { include: ['src/schemas/**\/*.ts'], withTypes: false };
 * ```
 */
export type PvlConfigFilePayload = InferOutput<typeof pvlConfigFilePayloadSchema>;

/**
 * Settings that take precedence over the config file: what each CLI flag sets.
 *
 * @example
 * ```ts
 * import { runCompilation, type PvlConfigOverrides } from '@pvl/schema-compiler';
 *
 * const overrides: PvlConfigOverrides = { destination: 'out/schemas' };
 * await runCompilation({ cwd: process.cwd(), overrides });
 * ```
 */
export type PvlConfigOverrides = Partial<PvlConfig>;
