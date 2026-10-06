// `pvlconfig.json`'s own schema, defined with `@pvl/schema`. The shipped
// JSON Schema is generated from it (`jsonSchema.ts`), so the two can't drift.
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
 * configSchema.validate({ destination: 'src/generated/schemas.ts' }); // { value: { ... } }
 * configSchema.validate({ destinaton: 'typo.ts' }); // { issues: [{ code: 'UNRECOGNIZED_KEY', ... }] }
 * ```
 */
export const configSchema = pvl
  .object({
    $schema: pvl.string().optional(),
    include: pvl.array(pvl.string()).optional(),
    destination: pvl.string().optional(),
    withTypes: pvl.boolean().optional(),
    watch: pvl.boolean().optional(),
  })
  .strict();

/**
 * The contents of a valid `pvlconfig.json`.
 *
 * @example
 * ```ts
 * import type { PvlConfig } from '@pvl/schema-compiler';
 *
 * const config: PvlConfig = { include: ['src/schemas/**\/*.ts'], withTypes: false };
 * ```
 */
export type PvlConfig = InferOutput<typeof configSchema>;

/**
 * Every setting the compiler runs with, once flags, the config file and the
 * defaults are merged. Relative paths are relative to the base directory: the
 * directory holding `pvlconfig.json`, or the working directory without one.
 *
 * @example
 * ```ts
 * import { compile } from '@pvl/schema-compiler';
 *
 * const { settings } = await compile({ cwd: process.cwd() });
 * settings?.include; // ['src/schemas/**\/*.ts'] unless configured
 * ```
 */
export type Settings = {
  /** Globs selecting the files to scan. `node_modules` and the destination are never scanned. */
  include: string[];
  /** The Destination File's path; unset means the default `node_modules` destination. */
  destination: string | undefined;
  /** Whether to generate a type alias for each Schema's input and output. */
  withTypes: boolean;
  /** Whether to recompile on every change. */
  watch: boolean;
};

/**
 * Settings that take precedence over the config file — what each CLI flag
 * sets.
 *
 * @example
 * ```ts
 * import { compile, type SettingOverrides } from '@pvl/schema-compiler';
 *
 * const overrides: SettingOverrides = { destination: 'out/schemas.ts' };
 * await compile({ cwd: process.cwd(), overrides });
 * ```
 */
export type SettingOverrides = Partial<Settings>;
