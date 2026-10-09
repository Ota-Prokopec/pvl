// The text every module holding a Compiled Schema shares, and the emitters
// by the factory whose Schema they compile.
import { ArraySchemaEmitter } from './emitters/arraySchemaEmitter.js';
import type { Emitter } from './emitters/emitter.js';
import { FLAT_EMITTER_BY_FACTORY } from './emitters/flatEmitters.js';
import { ObjectSchemaEmitter } from './emitters/objectSchemaEmitter.js';
import { SCHEMA_FACTORY, type SchemaFactory } from './enums.js';

/** The import a module holding a Compiled Schema gets, aliasing `@pvl/schema`'s exports so they can't clash with the module's own. */
export const COMPILED_SCHEMA_IMPORT =
  "import { Schema as PvlSchema, type Issue as PvlIssue, type Result as PvlResult } from '@pvl/schema';" as const;

/** The Issue path of a check on a Compiled Schema's root value: `undefined` at the root, as `Issue` itself makes it. */
export const ROOT_ISSUE_PATH = 'path.length > 0 ? path : undefined' as const;

/** Every emitter, by the factory whose Schema it compiles. A union has none yet, so it is unsupported. */
export const EMITTER_BY_FACTORY = {
  ...FLAT_EMITTER_BY_FACTORY,
  [SCHEMA_FACTORY.OBJECT]: ObjectSchemaEmitter,
  [SCHEMA_FACTORY.ARRAY]: ArraySchemaEmitter,
} as const satisfies Readonly<Partial<Record<SchemaFactory, typeof Emitter>>>;

/** The factories of the Schemas `pvl.compile()` may wrap: an object, an array or a union. */
export const COMPOSITE_FACTORIES: ReadonlySet<SchemaFactory> = new Set([
  SCHEMA_FACTORY.OBJECT,
  SCHEMA_FACTORY.ARRAY,
  SCHEMA_FACTORY.UNION,
]);
