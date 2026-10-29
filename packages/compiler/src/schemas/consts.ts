// The map from each `pvl.*` factory to the Schema subclass that reads it,
// which imports every subclass, so `readSchema.ts` loads them all through it.
import { PVL_FACTORY_NAMES_ENUM, type PvlFactoryName } from '@pcvl/schema';
import { ArraySchema } from './arraySchema.js';
import { BigintSchema } from './bigintSchema.js';
import { BooleanSchema } from './booleanSchema.js';
import { EnumSchema } from './enumSchema.js';
import { LiteralSchema } from './literalSchema.js';
import { NumberSchema } from './numberSchema.js';
import { ObjectSchema } from './objectSchema.js';
import type { SchemaClass } from './types/schemaClass.js';
import { StringSchema } from './stringSchema.js';
import { UnionSchema } from './unionSchema.js';

/** Every Schema subclass, by the `pvl.*` factory it reads, which is the subclass's own `factory`. */
export const SCHEMA_CLASS_BY_FACTORY = {
  [PVL_FACTORY_NAMES_ENUM.STRING]: StringSchema,
  [PVL_FACTORY_NAMES_ENUM.NUMBER]: NumberSchema,
  [PVL_FACTORY_NAMES_ENUM.BOOLEAN]: BooleanSchema,
  [PVL_FACTORY_NAMES_ENUM.BIGINT]: BigintSchema,
  [PVL_FACTORY_NAMES_ENUM.LITERAL]: LiteralSchema,
  [PVL_FACTORY_NAMES_ENUM.ENUM]: EnumSchema,
  [PVL_FACTORY_NAMES_ENUM.OBJECT]: ObjectSchema,
  [PVL_FACTORY_NAMES_ENUM.ARRAY]: ArraySchema,
  [PVL_FACTORY_NAMES_ENUM.UNION]: UnionSchema,
} satisfies { readonly [Factory in PvlFactoryName]: SchemaClass & { readonly factory: Factory } };
