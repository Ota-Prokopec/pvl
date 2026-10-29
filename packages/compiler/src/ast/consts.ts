import { COMPILE_MARKER_ALLOWED_PROPERTY_NAMES_ENUM } from './enums.js';

export const COMPILE_MARKER_ALLOWED_PROPERTY_NAMES = new Set(
  Object.values(COMPILE_MARKER_ALLOWED_PROPERTY_NAMES_ENUM),
);

/** The Module Specifier `pvl` is imported from. */
export const PVL_PACKAGE_SPECIFIER = '@pcvl/schema' as const;
