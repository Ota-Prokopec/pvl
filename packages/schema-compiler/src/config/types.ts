import type { InferOutput } from '@pvl/schema';
import type { pvlConfigFilePayloadSchema, pvlConfigSchema } from './config.js';

export type PvlConfig = InferOutput<typeof pvlConfigSchema>;

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
