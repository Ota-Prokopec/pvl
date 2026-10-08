// The `pvl.*` factories the compiler reads a Schema from.
import type { ValueOfEnum } from '@repo/types';

/** Every `pvl.*` factory a compiled Schema can be built from, valued by its name on `pvl`. */
export const SCHEMA_FACTORY = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  BIGINT: 'bigint',
  LITERAL: 'literal',
  ENUM: 'enum',
  OBJECT: 'object',
  ARRAY: 'array',
  UNION: 'union',
} as const;

export type SchemaFactory = ValueOfEnum<typeof SCHEMA_FACTORY>;
