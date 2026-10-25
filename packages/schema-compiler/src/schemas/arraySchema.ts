// `pvl.array(element)`: a composite whose elements each match one Schema,
// read from its argument, compiled by ArraySchemaEmitter.
import type { PvlFactoryCall } from '../ast/types.js';
import { ArraySchemaEmitter } from '../emitters/arraySchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type ReadFactoryArgs, type SchemaOptions } from './schema.js';

/** What an ArraySchema holds besides what every Schema does. */
export type ArraySchemaOptions = SchemaOptions & {
  element: Schema;
};

/**
 * A `pvl.array(element)` as read from source, holding its element's Schema.
 *
 * ```ts
 * ArraySchema.readFactoryArgument(<pvl.array(pvl.string())>, args)(options) // <ArraySchema whose element is <StringSchema>>
 * ```
 */
export class ArraySchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.ARRAY;

  public static override readonly emitter = ArraySchemaEmitter;

  /** The Schema every element matches. */
  public readonly element: Schema;

  /** A Schema holding its element's Schema besides what every Schema does. */
  private constructor({ element, ...options }: ArraySchemaOptions) {
    super(options);
    this.element = element;
  }

  /**
   * Reads the element of the `pvl.array(element)` `link` calls through
   * `readNested`, and returns how its ArraySchema is built from it and what
   * every Schema holds. Throws an UnresolvedNodeException when its element is
   * missing or can't be read.
   */
  public static readFactoryArgument(
    link: PvlFactoryCall,
    { readNested }: ReadFactoryArgs,
  ): (options: SchemaOptions) => ArraySchema {
    const element = readNested(Schema.readArgument(link), link.followed);
    return (options: SchemaOptions): ArraySchema => new ArraySchema({ ...options, element });
  }

  /**
   * Its element's Schema.
   *
   * ```ts
   * <pvl.array(pvl.string())>.findChildren() // [<pvl.string()>]
   * ```
   */
  public override findChildren(): ReadonlyArray<Schema> {
    return [this.element];
  }
}
