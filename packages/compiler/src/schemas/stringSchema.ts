// `pvl.string()`: a string, which reads no argument, compiled by
// StringSchemaEmitter.
import { StringSchemaEmitter } from '../emitters/stringSchemaEmitter.js';
import { PVL_FACTORY_NAMES_ENUM } from '@pcvl/schema';
import { Schema } from './schema.js';
import type { SchemaOptions } from './types/schemaOptions.js';

/**
 * A `pvl.string()` as read from source. It reads no argument, so any it is
 * given is ignored.
 *
 * ```ts
 * StringSchema.readFactoryArgument()(options) // <StringSchema>, holding `options`
 * ```
 */
export class StringSchema extends Schema {
  public static override readonly factory = PVL_FACTORY_NAMES_ENUM.STRING;

  public static override readonly emitter = StringSchemaEmitter;

  /** Reads no argument of `pvl.string()`, and returns how its StringSchema is built from what every Schema holds. */
  public static readFactoryArgument(): (options: SchemaOptions) => StringSchema {
    return (options: SchemaOptions): StringSchema => new StringSchema(options);
  }
}
