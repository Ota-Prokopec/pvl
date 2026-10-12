// `pvl.boolean()`: a boolean, which reads no argument, compiled by
// BooleanSchemaEmitter.
import type { CallChainLink } from '../ast/pvlAst.js';
import { BooleanSchemaEmitter } from '../emitters/booleanSchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type ReadFactoryArgs } from './schema.js';

/**
 * A `pvl.boolean()` as read from source. It reads no argument, so any it is
 * given is ignored.
 *
 * ```ts
 * BooleanSchema.fromFactory(<pvl.boolean()>, args) // <BooleanSchema>
 * ```
 */
export class BooleanSchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.BOOLEAN;

  public static override readonly emitter = BooleanSchemaEmitter;

  static {
    Schema.registerClass(BooleanSchema);
  }

  /** The `pvl.boolean()` `link` calls. */
  public static fromFactory(link: CallChainLink, args: ReadFactoryArgs): BooleanSchema {
    return new BooleanSchema(Schema.readOptions(link, args));
  }
}
