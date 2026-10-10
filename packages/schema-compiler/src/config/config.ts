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
 * configSchema.validate({ destination: 'src/generated' }); // { value: { ... } }
 * configSchema.validate({ destinaton: 'typo' }); // { issues: [{ code: 'UNRECOGNIZED_KEY', ... }] }
 * ```
 */
export const configSchema = pvl
  .object({
    include: pvl.array(pvl.string()).optional(),
    rootDir: pvl.string().optional(),
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
export type PvlConfig = Required<InferOutput<typeof configSchema>> & {
  destination?: string | undefined;
};

//TODO: make header comment
export type PvlConfigOverrides = Partial<PvlConfig>;
