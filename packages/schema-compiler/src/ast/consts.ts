import { PVL_OBJECT_PROPERTY_NAMES_ENUM, PVL_SCHEMA_METHOD_NAME_ENUM } from '@pvl/schema';
import { COMPILE_MARKER_ALLOWED_PROPERTY_NAMES_ENUM } from './enums.js';

export const COMPILE_MARKER_ALLOWED_PROPERTY_NAMES = new Set(
  Object.values(COMPILE_MARKER_ALLOWED_PROPERTY_NAMES_ENUM),
);

/** Every method of `pvl`, its factories and `compile`, as a name read from source is checked against. */
export const PVL_OBJECT_PROPERTY_NAMES: ReadonlySet<string> = new Set(
  Object.values(PVL_OBJECT_PROPERTY_NAMES_ENUM),
);

/** Every method of a Schema some `pvl.*` factory builds, Modifiers, `validate` and `standalone` included, as a name read from source is checked against. */
export const PVL_SCHEMA_METHOD_NAMES: ReadonlySet<string> = new Set(
  Object.values(PVL_SCHEMA_METHOD_NAME_ENUM),
);

/** The Module Specifier `pvl` is imported from. */
export const PVL_PACKAGE_SPECIFIER = '@pvl/schema' as const;
