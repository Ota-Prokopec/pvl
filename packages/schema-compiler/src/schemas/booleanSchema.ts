// `pvl.boolean()`: a boolean, which reads no argument, compiled by
// BooleanSchemaEmitter.
import { BooleanSchemaEmitter } from '../emitters/booleanSchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type SchemaOptions } from './schema.js';

/**
 * A `pvl.boolean()` as read from source. It reads no argument, so any it is
 * given is ignored.
 *
 * ```ts
 * BooleanSchema.readFactoryArgument()(options) // <BooleanSchema>, holding `options`
 * ```
 */
export class BooleanSchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.BOOLEAN;

  public static override readonly emitter = BooleanSchemaEmitter;

  /** Reads no argument of `pvl.boolean()`, and returns how its BooleanSchema is built from what every Schema holds. */
  public static readFactoryArgument(): (options: SchemaOptions) => BooleanSchema {
    return (options: SchemaOptions): BooleanSchema => new BooleanSchema(options);
  }
}
