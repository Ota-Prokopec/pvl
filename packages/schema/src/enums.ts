import { omit } from 'lodash-es';
import type {
  PvlObjectPropertyName,
  PvlFactoryName,
  PvlSchemaMethodName,
  PvlSchemaModifierMethodName,
  PvlSchemaPropertyName,
} from './types.js';

/**
 * Every {@link PvlObjectPropertyName}, valued by its name on `pvl`.
 *
 * @internal
 */
export const PVL_OBJECT_PROPERTY_NAMES_ENUM = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  BIGINT: 'bigint',
  LITERAL: 'literal',
  ENUM: 'enum',
  OBJECT: 'object',
  ARRAY: 'array',
  UNION: 'union',
  COMPILE: 'compile',
} as const satisfies {
  readonly [Factory in PvlObjectPropertyName as Uppercase<Factory>]: Factory;
};

/**
 * Every `pvl.*` factory a Schema is built from, valued by its name on `pvl`.
 *
 * @example
 * ```ts
 * import { pvl, PVL_FACTORY_NAMES_ENUM } from '@pvl/schema';
 *
 * pvl[PVL_FACTORY_NAMES_ENUM.STRING]().validate('hi'); // { value: 'hi' }
 * ```
 */
export const PVL_FACTORY_NAMES_ENUM = omit(PVL_OBJECT_PROPERTY_NAMES_ENUM, 'COMPILE') satisfies {
  // `compile` marks an existing Schema rather than building one.
  readonly [Factory in PvlFactoryName as Uppercase<Factory>]: Factory;
};

/**
 * Every {@link PvlSchemaPropertyName}, valued by its name on the Schema.
 *
 * @internal
 */
export const PVL_SCHEMA_PROPERTY_NAMES_ENUM = {
  VALIDATE: 'validate',
  STANDALONE: 'standalone',
  OPTIONAL: 'optional',
  NULLABLE: 'nullable',
  COERCE: 'coerce',
  MIN: 'min',
  MAX: 'max',
  LENGTH: 'length',
  INT: 'int',
  STRICT: 'strict',
  PASSTHROUGH: 'passthrough',
  REFINE: 'refine',
  TRANSFORM: 'transform',
  ELEMENT: 'element',
  SHAPE: 'shape',
} as const satisfies {
  readonly [Name in PvlSchemaPropertyName as Uppercase<Name>]: Name;
};

/**
 * Every {@link PvlSchemaMethodName}, valued by its name on the Schema.
 *
 * @internal
 */
export const PVL_SCHEMA_METHOD_NAME_ENUM = omit(
  PVL_SCHEMA_PROPERTY_NAMES_ENUM,
  'ELEMENT',
  'SHAPE',
) satisfies {
  readonly [Name in PvlSchemaMethodName as Uppercase<Name>]: Name;
};

/**
 * Every {@link PvlSchemaModifierMethodName}, valued by its name on the Schema.
 *
 * @internal
 */
export const PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM = omit(
  PVL_SCHEMA_METHOD_NAME_ENUM,
  'VALIDATE',
  'STANDALONE',
) satisfies {
  readonly [Name in PvlSchemaModifierMethodName as Uppercase<Name>]: Name;
};
