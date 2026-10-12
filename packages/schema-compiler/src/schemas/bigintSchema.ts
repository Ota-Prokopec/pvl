// `pvl.bigint()`: a bigint, which reads no argument, compiled by
// BigintSchemaEmitter.
import type { CallChainLink } from '../ast/pvlAst.js';
import { BigintSchemaEmitter } from '../emitters/bigintSchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type ReadFactoryArgs } from './schema.js';

/**
 * A `pvl.bigint()` as read from source. It reads no argument, so any it is
 * given is ignored.
 *
 * ```ts
 * BigintSchema.fromFactory(<pvl.bigint()>, args) // <BigintSchema>
 * ```
 */
export class BigintSchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.BIGINT;

  public static override readonly emitter = BigintSchemaEmitter;

  static {
    Schema.registerClass(BigintSchema);
  }

  /** The `pvl.bigint()` `link` calls. */
  public static fromFactory(link: CallChainLink, args: ReadFactoryArgs): BigintSchema {
    return new BigintSchema(Schema.readOptions(link, args));
  }
}
