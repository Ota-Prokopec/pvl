// The text every module holding a Compiled Schema shares.

/** The import a module holding a Compiled Schema gets, aliasing `@pvl/schema`'s exports so they can't clash with the module's own. */
export const COMPILED_SCHEMA_IMPORT =
  "import { Schema as PvlSchema, type Issue as PvlIssue, type Result as PvlResult } from '@pvl/schema';" as const;
