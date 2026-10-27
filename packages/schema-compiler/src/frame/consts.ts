// The names and fragments a Frame writes a Compiled Schema with: its type's
// Standalone marker, and its `_validate`'s parameters and closing return.

/** The name `COMPILED_SCHEMA_IMPORT` aliases `@pvl/schema`'s `StandaloneMarker` as, which `standalone()` and a marked Compiled Schema's type intersect. */
export const STANDALONE_MARKER_TYPE_NAME = 'PvlStandaloneMarker' as const;

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
