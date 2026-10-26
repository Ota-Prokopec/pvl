// `pvl.enum(members)`: one of a set of strings and numbers, read from its
// argument, compiled by EnumSchemaEmitter.
import type { EnumMember } from '@pvl/schema';
import type { Node } from 'ts-morph';
import { GenericAst, type FollowedConsts } from '../ast/genericAst.js';
import type { PvlFactoryCall } from '../ast/types.js';
import { UnresolvedNodeException } from '../exceptions/index.js';
import { EnumSchemaEmitter } from '../emitters/enumSchemaEmitter.js';
import { PVL_FACTORY_NAMES_ENUM } from '@pvl/schema';
import { Schema, type SchemaOptions } from './schema.js';

/** What an EnumSchema holds besides what every Schema does. */
export type EnumSchemaOptions = SchemaOptions & {
  members: ReadonlyArray<EnumMember>;
};

/**
 * A `pvl.enum(members)` as read from source, holding its members.
 *
 * ```ts
 * EnumSchema.readFactoryArgument(<pvl.enum(['A', 'B', 'A'])>)(options) // <EnumSchema whose members are ['A', 'B']>
 * EnumSchema.readFactoryArgument(<pvl.enum([])>)                       // throws
 * ```
 */
export class EnumSchema extends Schema {
  public static override readonly factory = PVL_FACTORY_NAMES_ENUM.ENUM;

  public static override readonly emitter = EnumSchemaEmitter;

  /** Every member it accepts, each once, in the order first written. */
  public readonly members: ReadonlyArray<EnumMember>;

  /** A Schema holding its members besides what every Schema does. */
  private constructor({ members, ...options }: EnumSchemaOptions) {
    super(options);
    this.members = members;
  }

  /**
   * Reads the members of the `pvl.enum(members)` `link` calls, and returns
   * how its EnumSchema is built from them and what every Schema holds.
   * Throws an UnresolvedNodeException when its argument is missing, or isn't a
   * non-empty string array or object of strings and numbers.
   */
  public static readFactoryArgument(link: PvlFactoryCall): (options: SchemaOptions) => EnumSchema {
    const members = EnumSchema.readMembers(Schema.readArgument(link), link.followed);
    return (options: SchemaOptions): EnumSchema => new EnumSchema({ ...options, members });
  }

  /**
   * `pvl.enum()`'s argument, a string array or an object of strings and
   * numbers, as its members, each once, as `@pvl/schema`'s `EnumSchema`
   * keeps them in a Set.
   *
   * ```ts
   * EnumSchema.readMembers(<['A', 'B', 'A']>, followed)  // ['A', 'B']
   * EnumSchema.readMembers(<{ A: 'a', B: 1 }>, followed) // ['a', 1]
   * EnumSchema.readMembers(<[]>, followed)               // throws
   * ```
   */
  private static readMembers(argument: Node, followed: FollowedConsts): EnumMember[] {
    const value = GenericAst.readStaticValue(argument, followed);
    const members = typeof value === 'object' ? Object.values(value) : [];
    if (
      members.length === 0 ||
      !members.every(
        (member): member is EnumMember => typeof member === 'string' || typeof member === 'number',
      )
    ) {
      throw new UnresolvedNodeException(argument);
    }
    return [...new Set(members)];
  }
}
