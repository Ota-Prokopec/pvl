// The text every module holding a Compiled Schema shares.

/** The import a module holding a Compiled Schema gets, aliasing `@pvl/schema`'s exports so they can't clash with the module's own. */
export const COMPILED_SCHEMA_IMPORT =
  "import { Schema as PvlSchema, type Issue as PvlIssue, type Result as PvlResult } from '@pvl/schema';" as const;

/** The Issue path of a check on a Compiled Schema's root value: `undefined` at the root, as `Issue` itself makes it. */
export const ROOT_ISSUE_PATH = 'path.length > 0 ? path : undefined' as const;
