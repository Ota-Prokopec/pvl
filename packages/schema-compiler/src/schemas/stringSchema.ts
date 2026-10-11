// `pvl.string()`: a string, which reads no argument, compiled by
// StringSchemaEmitter.
import type { CallChainLink } from '../ast/pvlAst.js';
import { StringSchemaEmitter } from '../emitters/stringSchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type ReadFactoryArgs } from '../schema.js';

/**
 * A `pvl.string()` as read from source. It reads no argument, so any it is
 * given is ignored.
 *
 * ```ts
 * StringSchema.fromFactory(<pvl.string()>, args) // <StringSchema>
 * ```
 */
export class StringSchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.STRING;

  public static override readonly emitter = StringSchemaEmitter;

  static {
    Schema.registerClass(StringSchema);
  }

  /** The `pvl.string()` `link` calls. */
  public static fromFactory(link: CallChainLink, args: ReadFactoryArgs): StringSchema {
    return new StringSchema(Schema.readOptions(link, args));
  }
}
