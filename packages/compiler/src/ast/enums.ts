import { PVL_SCHEMA_PROPERTY_NAMES_ENUM } from '@pcvl/schema';
import type { ValueOfEnum } from '@repo/types';
import { pick } from 'lodash-es';

/** The members that may still be read off the result of `pvl.compile(...)`: `.validate()`, `.standalone()`, and an object's `shape` and an array's `element`, which a Compiled Schema keeps (ADR-0036), each valued by its name on the Schema. Anything else read off it is a Modifier, a Constraint or a property a Compiled Schema doesn't have, reported as COMPILE_RESULT_MODIFIED. */
export const COMPILE_MARKER_ALLOWED_PROPERTY_NAMES_ENUM = {
  ...pick(PVL_SCHEMA_PROPERTY_NAMES_ENUM, 'VALIDATE', 'STANDALONE', 'SHAPE', 'ELEMENT'),
} as const;

export type CompileMarkerAllowedPropertyName = ValueOfEnum<
  typeof COMPILE_MARKER_ALLOWED_PROPERTY_NAMES_ENUM
>;
