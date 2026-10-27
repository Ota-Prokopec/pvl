// Which chained methods a Schema reads as pre-modifiers.
import { PVL_SCHEMA_PRE_MODIFIER_METHOD_NAMES_ENUM } from '@pvl/schema';

/** The methods `@pvl/schema` adds as pre-modifiers, which run before the type check (ADR-0010). */
export const PRE_MODIFIER_NAMES: ReadonlySet<string> = new Set(
  Object.values(PVL_SCHEMA_PRE_MODIFIER_METHOD_NAMES_ENUM),
);
