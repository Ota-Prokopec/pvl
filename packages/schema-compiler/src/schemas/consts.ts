// Which chained methods a Schema reads as pre-modifiers.
import {
  PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM,
  type PvlSchemaModifierMethodName,
} from '@pvl/schema';

/**
 * The methods `@pvl/schema` adds as pre-modifiers, through
 * `_withPreModifier`, which run before the type check; every other chained
 * method is a post-modifier (ADR-0010).
 */
export const PRE_MODIFIER_NAMES: ReadonlySet<string> = new Set<PvlSchemaModifierMethodName>([
  PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.OPTIONAL,
  PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.NULLABLE,
  PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.COERCE,
]);
