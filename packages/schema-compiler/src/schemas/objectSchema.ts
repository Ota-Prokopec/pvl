// `pvl.object(shape)`: a composite of named fields, each a Schema of its
// own read from the shape, compiled by ObjectSchemaEmitter.
import { GenericAst } from '../ast/genericAst.js';
import type { MethodCallWithFollowedConsts } from '../ast/pvlAst.js';
import { ObjectSchemaEmitter } from '../emitters/objectSchemaEmitter.js';
import { SCHEMA_FACTORY } from '../enums.js';
import { Schema, type ReadFactoryArgs, type SchemaOptions } from './schema.js';

/** One field of an object Schema. */
export type ObjectField = {
  key: string;
  schema: Schema;
};

/** What an ObjectSchema holds besides what every Schema does. */
export type ObjectSchemaOptions = SchemaOptions & {
  shape: ReadonlyArray<ObjectField>;
};

/**
 * A `pvl.object(shape)` as read from source, holding its fields in shape
 * order.
 *
 * ```ts
 * ObjectSchema.readFactoryArgument(<pvl.object({ name: pvl.string() })>, args)(options)
 * // <ObjectSchema whose shape is [{ key: 'name', schema: <StringSchema> }]>
 * ```
 */
export class ObjectSchema extends Schema {
  public static override readonly factory = SCHEMA_FACTORY.OBJECT;

  public static override readonly emitter = ObjectSchemaEmitter;

  /** Its fields, in shape order. */
  public readonly shape: ReadonlyArray<ObjectField>;

  /** A Schema holding its fields besides what every Schema does. */
  private constructor({ shape, ...options }: ObjectSchemaOptions) {
    super(options);
    this.shape = shape;
  }

  /**
   * Reads the shape of the `pvl.object(shape)` `link` calls, each field
   * through `readNested`, and returns how its ObjectSchema is built from it
   * and what every Schema holds. Throws an UnresolvedNodeError when its
   * shape is missing or isn't an object literal, or a field can't be read.
   */
  public static readFactoryArgument(
    link: MethodCallWithFollowedConsts,
    { readNested }: ReadFactoryArgs,
  ): (options: SchemaOptions) => ObjectSchema {
    const fieldSchemaByKey = GenericAst.readObject(
      Schema.readArgument(link),
      readNested,
      link.followed,
    );
    const shape = Object.entries(fieldSchemaByKey).map(([key, schema]) => ({ key, schema }));
    return (options: SchemaOptions): ObjectSchema => new ObjectSchema({ ...options, shape });
  }

  /**
   * Its fields' Schemas, in shape order.
   *
   * ```ts
   * <pvl.object({ a: pvl.string(), b: pvl.number() })>.findChildren() // [<pvl.string()>, <pvl.number()>]
   * ```
   */
  public override findChildren(): ReadonlyArray<Schema> {
    return this.shape.map(({ schema }) => schema);
  }
}
