// Narrowing a method name read from source to the name `@pvl/schema` gives
// it, so PvlAst hands on `pvl`'s and a Schema's methods typed (ADR-0038).
import type { PvlObjectPropertyName, PvlSchemaMethodName } from '@pvl/schema';
import { PVL_OBJECT_PROPERTY_NAMES, PVL_SCHEMA_METHOD_NAMES } from './consts.js';

/**
 * Whether `methodName` is a method of `pvl`: a factory, or `compile`.
 *
 * ```ts
 * isPvlObjectPropertyName('string')   // true
 * isPvlObjectPropertyName('compile')  // true
 * isPvlObjectPropertyName('min')      // false: a Schema's method
 * isPvlObjectPropertyName('toString') // false
 * ```
 */
export const isPvlObjectPropertyName = (methodName: string): methodName is PvlObjectPropertyName =>
  PVL_OBJECT_PROPERTY_NAMES.has(methodName);

/**
 * Whether `methodName` is a method of a Schema some `pvl.*` factory builds:
 * a Modifier, `validate` or `standalone`, whichever factory has it.
 *
 * ```ts
 * isPvlSchemaMethodName('min')      // true
 * isPvlSchemaMethodName('strict')   // true: an object's, whatever it is chained onto
 * isPvlSchemaMethodName('validate') // true
 * isPvlSchemaMethodName('compile')  // false: a method of `pvl`, not of a Schema
 * isPvlSchemaMethodName('foo')      // false
 * ```
 */
export const isPvlSchemaMethodName = (methodName: string): methodName is PvlSchemaMethodName =>
  PVL_SCHEMA_METHOD_NAMES.has(methodName);
