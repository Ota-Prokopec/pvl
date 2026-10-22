// `pvl.union(members)`: a composite matching any one of its member Schemas,
// read from its argument. It has no Emitter yet, so it is reported as
// UNSUPPORTED_SCHEMA wherever it is written.
import { GenericAst } from '../ast/genericAst.js';
import type { CallChainLink } from '../ast/pvlAst.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type ReadFactoryArgs, type SchemaOptions } from './schema.js';

/** What a UnionSchema holds besides what every Schema does. */
export type UnionSchemaOptions = SchemaOptions & {
  members: ReadonlyArray<Schema>;
};

/**
 * A `pvl.union(members)` as read from source, holding its members' Schemas.
 *
 * ```ts
 * UnionSchema.readFactoryArgument(<pvl.union([pvl.string(), pvl.number()])>, args)(options)
 * // <UnionSchema whose members are [<StringSchema>, <NumberSchema>]>
 * ```
 */
export class UnionSchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.UNION;

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
   * them and what every Schema holds. Throws an UnresolvedNodeError when
   * its members are missing or aren't an array literal, or a member can't
   * be read.
   */
  public static readFactoryArgument(
    link: CallChainLink,
    { readNested }: ReadFactoryArgs,
  ): (options: SchemaOptions) => UnionSchema {
    const members = GenericAst.readArray(Schema.readArgument(link), readNested, link.followed);
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
