// The text every module holding a Compiled Schema shares, and the emitters
// by the factory whose Schema they compile.
import { ArraySchemaEmitter } from './emitters/arraySchemaEmitter.js';
import { BigintSchemaEmitter } from './emitters/bigintSchemaEmitter.js';
import { BooleanSchemaEmitter } from './emitters/booleanSchemaEmitter.js';
import type { Emitter } from './emitters/emitter.js';
import { EnumSchemaEmitter } from './emitters/enumSchemaEmitter.js';
import { LiteralSchemaEmitter } from './emitters/literalSchemaEmitter.js';
import { NumberSchemaEmitter } from './emitters/numberSchemaEmitter.js';
import { ObjectSchemaEmitter } from './emitters/objectSchemaEmitter.js';
import { StringSchemaEmitter } from './emitters/stringSchemaEmitter.js';
import { SCHEMA_FACTORY, type SchemaFactory } from './enums.js';

/** The import a module holding a Compiled Schema gets, aliasing `@pvl/schema`'s exports so they can't clash with the module's own. */
export const COMPILED_SCHEMA_IMPORT =
  "import { Schema as PvlSchema, type Issue as PvlIssue, type Result as PvlResult } from '@pvl/schema';" as const;

/** The Issue path of a check on a Compiled Schema's root value: `undefined` at the root, as `Issue` itself makes it. */
export const ROOT_ISSUE_PATH = 'path.length > 0 ? path : undefined' as const;

/** Every emitter, by the factory whose Schema it compiles. A union has none yet, so it is unsupported. */
export const EMITTER_BY_FACTORY: Readonly<Partial<Record<SchemaFactory, typeof Emitter>>> = {
  [SCHEMA_FACTORY.STRING]: StringSchemaEmitter,
  [SCHEMA_FACTORY.NUMBER]: NumberSchemaEmitter,
  [SCHEMA_FACTORY.BOOLEAN]: BooleanSchemaEmitter,
  [SCHEMA_FACTORY.BIGINT]: BigintSchemaEmitter,
  [SCHEMA_FACTORY.LITERAL]: LiteralSchemaEmitter,
  [SCHEMA_FACTORY.ENUM]: EnumSchemaEmitter,
  [SCHEMA_FACTORY.OBJECT]: ObjectSchemaEmitter,
  [SCHEMA_FACTORY.ARRAY]: ArraySchemaEmitter,
};

/** The factories of the Schemas `pvl.compile()` may wrap: an object, an array or a union. */
export const COMPOSITE_FACTORIES: ReadonlySet<SchemaFactory> = new Set([
  SCHEMA_FACTORY.OBJECT,
  SCHEMA_FACTORY.ARRAY,
  SCHEMA_FACTORY.UNION,
]);
