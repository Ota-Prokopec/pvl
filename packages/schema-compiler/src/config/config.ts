// `pvlconfig.json`'s own schema, defined with `@pvl/schema`. The shipped
// JSON Schema is written by hand in `json-schema.json`, so a change here needs
// the same change there; `tests/json-schema.test.ts` catches the two drifting,
// reading every key through `shape`, which is why each one is a Standalone Key.
import { pvl, type InferOutput } from '@pvl/schema';

/**
 * The schema `pvlconfig.json` is validated against. Every key is optional and
 * an unknown key is rejected, so a misspelt setting is reported rather than
 * ignored.
 *
 * @example
 * ```ts
 * import { configSchema } from '@pvl/schema-compiler';
 *
 * configSchema.validate({ destination: 'src/generated' }); // { value: { ... } }
 * configSchema.validate({ destinaton: 'typo' }); // { issues: [{ code: 'UNRECOGNIZED_KEY', ... }] }
 * ```
 */
export const configSchema = pvl
  .object({
    $schema: pvl.string().optional().standalone(),
    include: pvl.array(pvl.string()).optional().standalone(),
    rootDir: pvl.string().optional().standalone(),
    destination: pvl.string().optional().standalone(),
    withTypes: pvl.boolean().optional().standalone(),
    watch: pvl.boolean().optional().standalone(),
  })
  .strict();

/**
 * The contents of a valid `pvlconfig.json`: every key it may set, each optional.
 *
 * @example
 * ```ts
 * import type { PvlConfigFile } from '@pvl/schema-compiler';
 *
 * const file: PvlConfigFile = { include: ['src/schemas/**\/*.ts'], withTypes: false };
 * ```
 */
export type PvlConfigFile = InferOutput<typeof configSchema>;

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
  /** Whether to recompile on every change. */
  watch: boolean;
};

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
