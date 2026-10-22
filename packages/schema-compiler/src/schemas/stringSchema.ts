// `pvl.string()`: a string, which reads no argument, compiled by
// StringSchemaEmitter.
import { StringSchemaEmitter } from '../emitters/stringSchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type SchemaOptions } from './schema.js';

/**
 * A `pvl.string()` as read from source. It reads no argument, so any it is
 * given is ignored.
 *
 * ```ts
 * StringSchema.readFactoryArgument()(options) // <StringSchema>, holding `options`
 * ```
 */
export class StringSchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.STRING;

  public static override readonly emitter = StringSchemaEmitter;

  /** Reads no argument of `pvl.string()`, and returns how its StringSchema is built from what every Schema holds. */
  public static readFactoryArgument(): (options: SchemaOptions) => StringSchema {
    return (options: SchemaOptions): StringSchema => new StringSchema(options);
  }
}
