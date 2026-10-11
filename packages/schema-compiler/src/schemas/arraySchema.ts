// `pvl.array(element)`: a composite whose elements each match one Schema,
// read from its argument, compiled by ArraySchemaEmitter.
import type { CallChainLink } from '../ast/pvlAst.js';
import { ArraySchemaEmitter } from '../emitters/arraySchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type ReadFactoryArgs, type SchemaOptions } from '../schema.js';

/** What an ArraySchema holds besides what every Schema does. */
export type ArraySchemaOptions = SchemaOptions & {
  element: Schema;
};

/**
 * A `pvl.array(element)` as read from source, holding its element's Schema.
 *
 * ```ts
 * ArraySchema.fromFactory(<pvl.array(pvl.string())>, args) // <ArraySchema whose element is <StringSchema>>
 * ```
 */
export class ArraySchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.ARRAY;

  public static override readonly emitter = ArraySchemaEmitter;

  static {
    Schema.registerClass(ArraySchema);
  }

  /** The Schema every element matches. */
  public readonly element: Schema;

  /** A Schema holding its element's Schema besides what every Schema does. */
  private constructor({ element, ...options }: ArraySchemaOptions) {
    super(options);
    this.element = element;
  }

  /** `true`: `pvl.compile()` may wrap an array. */
  public override get isComposite(): boolean {
    return true;
  }

  /**
   * The `pvl.array(element)` `link` calls, its element read through
   * `args.readNested`. Throws an UnresolvedNodeError when its element is
   * missing or can't be read.
   */
  public static fromFactory(link: CallChainLink, args: ReadFactoryArgs): ArraySchema {
    const element = args.readNested(Schema.readArgument(link), link.followed);
    return new ArraySchema({ ...Schema.readOptions(link, args), element });
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
