// The names and fragments a Frame writes a Compiled Schema with: the names
// `@pvl/schema`'s exports are imported as, and its `_validate`'s parameters
// and closing return.

/** The name `COMPILED_SCHEMA_IMPORT` aliases `@pvl/schema`'s `Schema` as, which a Compiled Schema implements and is cast up to. */
export const SCHEMA_TYPE_NAME = 'PvlSchema' as const;

/** The name `COMPILED_SCHEMA_IMPORT` aliases `@pvl/schema`'s `SCHEMA_BRAND` as, which a Compiled Schema declares. */
export const SCHEMA_BRAND_NAME = 'PVL_SCHEMA_BRAND' as const;

/** The name `COMPILED_SCHEMA_IMPORT` aliases `@pvl/schema`'s `StandardSchemaProps` as, which a Compiled Schema's `~standard` returns. */
export const STANDARD_SCHEMA_PROPS_TYPE_NAME = 'PvlStandardSchemaProps' as const;

/** The name `COMPILED_SCHEMA_IMPORT` aliases `@pvl/schema`'s `Result` as, which a Compiled Schema's `validate` and `_validate` return. */
export const RESULT_TYPE_NAME = 'PvlResult' as const;

/** The name `COMPILED_SCHEMA_IMPORT` aliases `@pvl/schema`'s `Issue` as, which `_validate`'s Issues are typed with. */
export const ISSUE_CLASS_NAME = 'PvlIssue' as const;

/** The name `COMPILED_SCHEMA_IMPORT` aliases `@pvl/schema`'s `StandaloneMarker` as, which `standalone()` and a marked Compiled Schema's type intersect. */
export const STANDALONE_MARKER_TYPE_NAME = 'PvlStandaloneMarker' as const;

/** The name `STANDALONE_BRAND_IMPORT` aliases `@pvl/schema`'s `STANDALONE_BRAND` as, which a marked Compiled Schema declares. */
export const STANDALONE_BRAND_NAME = 'PVL_STANDALONE_BRAND' as const;

/** The name of a Compiled Schema's `_validate` value parameter, which the root is checked at. */
export const VALIDATE_VALUE_PARAMETER_NAME = 'value' as const;

/** The name of a Compiled Schema's `_validate` path parameter, which the root's Issues are reported at. */
export const VALIDATE_PATH_PARAMETER_NAME = 'path' as const;

/** `_validate`'s parameter list, as the `Schema` type declares it. */
export const VALIDATE_PARAMETERS =
  `${VALIDATE_VALUE_PARAMETER_NAME}: unknown, ${VALIDATE_PATH_PARAMETER_NAME}: ReadonlyArray<PropertyKey>` as const;

/**
 * `_validate`'s closing return, its Result: the Issues its checks
 * collected, when there are any, or else its value parameter, which a
 * composite's checks replaced with the output they built. The shorthand
 * names the Result's `value` key after that parameter.
 */
export const VALIDATE_RETURN_STATEMENT =
  `return issues.length > 0 ? { issues } : { ${VALIDATE_VALUE_PARAMETER_NAME} };` as const;
