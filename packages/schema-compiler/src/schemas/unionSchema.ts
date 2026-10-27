// `pvl.union(members)`: a composite matching any one of its member Schemas,
// read from its argument. It has no Emitter yet, so it is reported as
// UNSUPPORTED_SCHEMA wherever it is written.
import { GenericAst } from '../ast/genericAst.js';
import { PvlAst } from '../ast/pvlAst.js';
import type { PvlFactoryCall } from '../ast/types.js';
import { PVL_FACTORY_NAMES_ENUM } from '@pvl/schema';
import { Schema } from './schema.js';
import type { ReadFactoryArgs, SchemaOptions, UnionSchemaOptions } from './types.js';

/**
 * A `pvl.union(members)` as read from source, holding its members' Schemas.
 *
 * ```ts
 * UnionSchema.readFactoryArgument(<pvl.union([pvl.string(), pvl.number()])>, args)(options)
 * // <UnionSchema whose members are [<StringSchema>, <NumberSchema>]>
 * ```
 */
export class UnionSchema extends Schema {
  public static override readonly factory = PVL_FACTORY_NAMES_ENUM.UNION;

  /** `undefined`: a union can't be compiled yet, which reports UNSUPPORTED_SCHEMA. */
  public static override readonly emitter = undefined;

  /** The Schemas a value may match, in the order written. */
  public readonly members: ReadonlyArray<Schema>;

  /** A Schema holding its members' Schemas besides what every Schema does. */
  private constructor({ members, ...options }: UnionSchemaOptions) {
    super(options);
    this.members = members;
  }

  /**
   * Reads the members of the `pvl.union(members)` `link` calls, each
   * through `readNested`, and returns how its UnionSchema is built from
   * them and what every Schema holds. Throws an UnresolvedNodeException when
   * its members are missing or aren't an array literal, or a member can't
   * be read.
   */
  public static readFactoryArgument(
    link: PvlFactoryCall,
    { readNested }: ReadFactoryArgs,
  ): (options: SchemaOptions) => UnionSchema {
    const members = GenericAst.readArray(PvlAst.readArgument(link), readNested, link.followed);
    return (options: SchemaOptions): UnionSchema => new UnionSchema({ ...options, members });
  }

  /**
   * Its members' Schemas.
   *
   * ```ts
   * <pvl.union([pvl.string(), pvl.number()])>.findChildren() // [<pvl.string()>, <pvl.number()>]
   * ```
   */
  public override findChildren(): ReadonlyArray<Schema> {
    return this.members;
  }
}
