// `pvl.enum(members)`: one of a set of strings and numbers, read from its
// argument, compiled by EnumSchemaEmitter.
import type { EnumMember } from '@pvl/schema';
import type { Node } from 'ts-morph';
import { GenericAst, type FollowedConsts } from '../ast/genericAst.js';
import type { CallChainLink } from '../ast/pvlAst.js';
import { UnresolvedNodeError } from '../ast/unresolvedNodeError.js';
import { EnumSchemaEmitter } from '../emitters/enumSchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type ReadFactoryArgs, type SchemaOptions } from './schema.js';

/** What an EnumSchema holds besides what every Schema does. */
export type EnumSchemaOptions = SchemaOptions & {
  members: ReadonlyArray<EnumMember>;
};

/**
 * A `pvl.enum(members)` as read from source, holding its members.
 *
 * ```ts
 * EnumSchema.fromFactory(<pvl.enum(['A', 'B', 'A'])>, args) // <EnumSchema whose members are ['A', 'B']>
 * EnumSchema.fromFactory(<pvl.enum([])>, args)              // throws
 * ```
 */
export class EnumSchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.ENUM;

  public static override readonly emitter = EnumSchemaEmitter;

  static {
    Schema.registerClass(EnumSchema);
  }

  /** Every member it accepts, each once, in the order first written. */
  public readonly members: ReadonlyArray<EnumMember>;

  /** A Schema holding its members besides what every Schema does. */
  private constructor({ members, ...options }: EnumSchemaOptions) {
    super(options);
    this.members = members;
  }

  /**
   * The `pvl.enum(members)` `link` calls. Throws an UnresolvedNodeError
   * when its argument is missing, or isn't a non-empty string array or
   * object of strings and numbers.
   */
  public static fromFactory(link: CallChainLink, args: ReadFactoryArgs): EnumSchema {
    const members = EnumSchema.readMembers(Schema.readArgument(link), link.followed);
    return new EnumSchema({ ...Schema.readOptions(link, args), members });
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
      throw new UnresolvedNodeError(argument);
    }
    return [...new Set(members)];
  }
}
