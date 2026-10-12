// `pvl.literal(value)`: one exact value, read from its argument, compiled by
// LiteralSchemaEmitter.
import type { PossibleLiteralValue } from '@pvl/schema';
import type { Node } from 'ts-morph';
import { GenericAst, type FollowedConsts } from '../ast/genericAst.js';
import type { CallChainLink } from '../ast/pvlAst.js';
import { UnresolvedNodeError } from '../ast/unresolvedNodeError.js';
import { LiteralSchemaEmitter } from '../emitters/literalSchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type ReadFactoryArgs, type SchemaOptions } from './schema.js';

/** What a LiteralSchema holds besides what every Schema does. */
export type LiteralSchemaOptions = SchemaOptions & {
  value: PossibleLiteralValue;
};

/**
 * A `pvl.literal(value)` as read from source, holding its value.
 *
 * ```ts
 * LiteralSchema.fromFactory(<pvl.literal('a')>, args)      // <LiteralSchema whose value is 'a'>
 * LiteralSchema.fromFactory(<pvl.literal({ a: 1 })>, args) // throws
 * ```
 */
export class LiteralSchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.LITERAL;

  public static override readonly emitter = LiteralSchemaEmitter;

  static {
    Schema.registerClass(LiteralSchema);
  }

  /** The value it accepts. */
  public readonly value: PossibleLiteralValue;

  /** A Schema holding its value besides what every Schema does. */
  private constructor({ value, ...options }: LiteralSchemaOptions) {
    super(options);
    this.value = value;
  }

  /**
   * The `pvl.literal(value)` `link` calls. Throws an UnresolvedNodeError
   * when its argument is missing, isn't a literal, or is an object or an
   * array.
   */
  public static fromFactory(link: CallChainLink, args: ReadFactoryArgs): LiteralSchema {
    const value = LiteralSchema.readValue(Schema.readArgument(link), link.followed);
    return new LiteralSchema({ ...Schema.readOptions(link, args), value });
  }

  /**
   * `pvl.literal()`'s argument: a literal that isn't an object or an array.
   *
   * ```ts
   * LiteralSchema.readValue(<'a'>, followed)      // 'a'
   * LiteralSchema.readValue(<{ a: 1 }>, followed) // throws
   * ```
   */
  private static readValue(argument: Node, followed: FollowedConsts): PossibleLiteralValue {
    const value = GenericAst.readStaticValue(argument, followed);
    if (typeof value === 'object') {
      throw new UnresolvedNodeError(argument);
    }
    return value;
  }
}
