// The JSON Schema shipped as `@pvl/schema-compiler/json-schema` for editor
// autocomplete in `pvlconfig.json`, generated from `configSchema` at build
// time (see `tsup.config.ts`) so it can't drift from the runtime check.
import {
  ArraySchema,
  BooleanSchema,
  ISSUE_CODE,
  ObjectSchema,
  StringSchema,
  type Issue,
  type Schema,
} from '@pvl/schema';
import { configSchema, type PvlConfig } from './config.js';
import { DEFAULT_INCLUDE, DEFAULT_WATCH, DEFAULT_WITH_TYPES } from './consts.js';

/**
 * The subset of JSON Schema (draft-07) the config's schema is expressed in.
 *
 * @example
 * ```ts
 * import type { JsonSchema } from '@pvl/schema-compiler';
 *
 * const flag: JsonSchema = { type: 'boolean', default: false };
 * ```
 */
export type JsonSchema = {
  $schema?: string;
  title?: string;
  description?: string;
  type?: 'object' | 'array' | 'string' | 'boolean';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  default?: unknown;
};

// What an editor shows for each key. Typed against `PvlConfig`, so a new
// setting without a description fails to typecheck.
const DESCRIPTIONS: Readonly<Record<keyof PvlConfig, string>> = {
  $schema: 'The JSON Schema this file is checked against, for editor autocomplete.',
  include:
    'Globs selecting the schema files to compile, relative to this file. node_modules and the destination are never included.',
  destination:
    'Where to write the Destination File, relative to this file. Unset, it goes to node_modules/.pvl/compiled-schemas and is imported as @pvl/compiled-schemas.',
  withTypes: "Whether to generate each compiled Schema's Data and Input type aliases.",
  watch: 'Whether `pvl compile` keeps running and recompiles on every change.',
};

const DEFAULTS: Readonly<Partial<Record<keyof PvlConfig, unknown>>> = {
  include: DEFAULT_INCLUDE,
  withTypes: DEFAULT_WITH_TYPES,
  watch: DEFAULT_WATCH,
};

// A key no shape declares, to ask an object schema whether it is strict.
const PROBE_KEY = '\u0000probe' as const;

// Only the schema types the config uses are mapped: any other one throws, so
// a config change the mapping can't express fails the build loudly. Modifiers
// aren't readable, so optionality and strictness are probed through
// `validate()`.
const toJsonSchema = (schema: Schema<unknown, unknown>): JsonSchema => {
  if (schema instanceof ObjectSchema) {
    const shape: Readonly<Record<string, Schema<unknown, unknown>>> = schema.shape;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, field] of Object.entries(shape)) {
      properties[key] = toJsonSchema(field);
      if (field.validate(undefined).issues) {
        required.push(key);
      }
    }
    const isStrict =
      schema
        .validate({ [PROBE_KEY]: null })
        .issues?.some((issue: Issue) => issue.code === ISSUE_CODE.UNRECOGNIZED_KEY) ?? false;
    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
      ...(isStrict ? { additionalProperties: false } : {}),
    };
  }
  if (schema instanceof ArraySchema) {
    const element: Schema<unknown, unknown> = schema.element;
    return { type: 'array', items: toJsonSchema(element) };
  }
  if (schema instanceof StringSchema) {
    return { type: 'string' };
  }
  if (schema instanceof BooleanSchema) {
    return { type: 'boolean' };
  }
  throw new Error(
    `No JSON Schema mapping for ${schema.constructor.name}: add one to jsonSchema.ts.`,
  );
};

const isConfigKey = (key: string): key is keyof PvlConfig => key in DESCRIPTIONS;

/**
 * The JSON Schema for `pvlconfig.json`, generated from {@link configSchema}.
 * The same document ships with the package as
 * `@pvl/schema-compiler/json-schema`; point `$schema` at it for editor
 * autocomplete.
 *
 * @example
 * ```ts
 * import { configJsonSchema } from '@pvl/schema-compiler';
 *
 * configJsonSchema().properties?.include?.default; // ['src/schemas/**\/*.ts']
 * ```
 */
export const configJsonSchema = (): JsonSchema => {
  const root = toJsonSchema(configSchema);
  const properties: Record<string, JsonSchema> = {};
  for (const [key, property] of Object.entries(root.properties ?? {})) {
    properties[key] = isConfigKey(key)
      ? {
          description: DESCRIPTIONS[key],
          ...property,
          ...(DEFAULTS[key] === undefined ? {} : { default: DEFAULTS[key] }),
        }
      : property;
  }
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'pvlconfig.json',
    description: 'Configuration for `pvl compile` (@pvl/schema-compiler).',
    ...root,
    properties,
  };
};
