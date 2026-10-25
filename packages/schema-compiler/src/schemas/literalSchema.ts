// `pvl.literal(value)`: one exact value, read from its argument, compiled by
// LiteralSchemaEmitter.
import type { PossibleLiteralValue } from '@pvl/schema';
import type { Node } from 'ts-morph';
import { GenericAst, type FollowedConsts } from '../ast/genericAst.js';
import type { PvlFactoryCall } from '../ast/types.js';
import { UnresolvedNodeException } from '../exceptions/index.js';
import { LiteralSchemaEmitter } from '../emitters/literalSchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type SchemaOptions } from './schema.js';

/** What a LiteralSchema holds besides what every Schema does. */
export type LiteralSchemaOptions = SchemaOptions & {
  value: PossibleLiteralValue;
};

/**
 * A `pvl.literal(value)` as read from source, holding its value.
 *
 * ```ts
 * LiteralSchema.readFactoryArgument(<pvl.literal('a')>)(options) // <LiteralSchema whose value is 'a'>
 * LiteralSchema.readFactoryArgument(<pvl.literal({ a: 1 })>)     // throws
 * ```
 */
export class LiteralSchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.LITERAL;

  public static override readonly emitter = LiteralSchemaEmitter;

  /** The value it accepts. */
  public readonly value: PossibleLiteralValue;

  /** A Schema holding its value besides what every Schema does. */
  private constructor({ value, ...options }: LiteralSchemaOptions) {
    super(options);
    this.value = value;
  }

  /**
   * Reads the value of the `pvl.literal(value)` `link` calls, and returns
   * how its LiteralSchema is built from it and what every Schema holds.
   * Throws an UnresolvedNodeException when its argument is missing, isn't a
   * literal, or is an object or an array.
   */
  public static readFactoryArgument(
    link: PvlFactoryCall,
  ): (options: SchemaOptions) => LiteralSchema {
    const value = LiteralSchema.readValue(Schema.readArgument(link), link.followed);
    return (options: SchemaOptions): LiteralSchema => new LiteralSchema({ ...options, value });
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
      throw new UnresolvedNodeException(argument);
    }
    return value;
  }
}
