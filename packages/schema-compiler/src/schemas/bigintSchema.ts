// `pvl.bigint()`: a bigint, which reads no argument, compiled by
// BigintSchemaEmitter.
import { BigintSchemaEmitter } from '../emitters/bigintSchemaEmitter.js';
import { PVL_FACTORY_NAMES_ENUM } from '@pvl/schema';
import { Schema, type SchemaOptions } from './schema.js';

/**
 * A `pvl.bigint()` as read from source. It reads no argument, so any it is
 * given is ignored.
 *
 * ```ts
 * BigintSchema.readFactoryArgument()(options) // <BigintSchema>, holding `options`
 * ```
 */
export class BigintSchema extends Schema {
  public static override readonly factory = PVL_FACTORY_NAMES_ENUM.BIGINT;

  public static override readonly emitter = BigintSchemaEmitter;

  /** Reads no argument of `pvl.bigint()`, and returns how its BigintSchema is built from what every Schema holds. */
  public static readFactoryArgument(): (options: SchemaOptions) => BigintSchema {
    return (options: SchemaOptions): BigintSchema => new BigintSchema(options);
  }
}
