// `pvl.number()`: a number, which reads no argument, compiled by
// NumberSchemaEmitter.
import { NumberSchemaEmitter } from '../emitters/numberSchemaEmitter.js';
import { PVL_FACTORY_NAMES_ENUM } from '@pvl/schema';
import { Schema } from './schema.js';
import type { SchemaOptions } from './types.js';

/**
 * A `pvl.number()` as read from source. It reads no argument, so any it is
 * given is ignored.
 *
 * ```ts
 * NumberSchema.readFactoryArgument()(options) // <NumberSchema>, holding `options`
 * ```
 */
export class NumberSchema extends Schema {
  public static override readonly factory = PVL_FACTORY_NAMES_ENUM.NUMBER;

  public static override readonly emitter = NumberSchemaEmitter;

  /** Reads no argument of `pvl.number()`, and returns how its NumberSchema is built from what every Schema holds. */
  public static readFactoryArgument(): (options: SchemaOptions) => NumberSchema {
    return (options: SchemaOptions): NumberSchema => new NumberSchema(options);
  }
}
