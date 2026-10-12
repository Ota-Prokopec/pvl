// `pvl.number()`: a number, which reads no argument, compiled by
// NumberSchemaEmitter.
import type { CallChainLink } from '../ast/pvlAst.js';
import { NumberSchemaEmitter } from '../emitters/numberSchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type ReadFactoryArgs } from './schema.js';

/**
 * A `pvl.number()` as read from source. It reads no argument, so any it is
 * given is ignored.
 *
 * ```ts
 * NumberSchema.fromFactory(<pvl.number()>, args) // <NumberSchema>
 * ```
 */
export class NumberSchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.NUMBER;

  public static override readonly emitter = NumberSchemaEmitter;

  static {
    Schema.registerClass(NumberSchema);
  }

  /** The `pvl.number()` `link` calls. */
  public static fromFactory(link: CallChainLink, args: ReadFactoryArgs): NumberSchema {
    return new NumberSchema(Schema.readOptions(link, args));
  }
}
