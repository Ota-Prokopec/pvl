// `pvl.object(shape)`: a composite of named fields, each a Schema of its
// own read from the shape, compiled by ObjectSchemaEmitter.
import { GenericAst } from '../ast/genericAst.js';
import type { PvlFactoryCall } from '../ast/types.js';
import { ObjectSchemaEmitter } from '../emitters/objectSchemaEmitter.js';
import { PVL_FACTORY_NAMES_ENUM, PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM } from '@pvl/schema';
import { UNKNOWN_KEYS_METHOD_NAMES } from '../consts.js';
import { UNKNOWN_KEYS_MODE, type UnknownKeysMode } from '../enums.js';
import { Schema, type ReadFactoryArgs, type SchemaOptions } from './schema.js';
import type { SchemaModifierCall } from './schemaTypes.js';

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
  public static override readonly factory = PVL_FACTORY_NAMES_ENUM.OBJECT;

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
   * and what every Schema holds. Throws an UnresolvedNodeException when its
   * shape is missing or isn't an object literal, or a field can't be read.
   */
  public static readFactoryArgument(
    link: PvlFactoryCall,
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
   * The keys its shape declares, in shape order.
   *
   * ```ts
   * <pvl.object({ name: pvl.string(), age: pvl.number() })>.declaredKeys // ['name', 'age']
   * ```
   */
  public get declaredKeys(): ReadonlyArray<string> {
    return this.shape.map(({ key }) => key);
  }

  /**
   * Its unknown-key mode, set by the last of `.strict()` and `.passthrough()`
   * chained, since each removes the other; `STRIP` with neither, as
   * `ObjectInterpretedSchema` strips until one sets its `_keepsUnknownKeys`
   * (ADR-0007).
   *
   * ```ts
   * <pvl.object({}).strict().passthrough()>.unknownKeysMode // 'PASSTHROUGH'
   * <pvl.object({})>.unknownKeysMode                        // 'STRIP'
   * ```
   */
  public get unknownKeysMode(): UnknownKeysMode {
    const name = this.findUnknownKeysCall()?.name;
    if (name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.STRICT) {
      return UNKNOWN_KEYS_MODE.STRICT;
    }
    return name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.PASSTHROUGH
      ? UNKNOWN_KEYS_MODE.PASSTHROUGH
      : UNKNOWN_KEYS_MODE.STRIP;
  }

  /**
   * Its post-modifiers, in chain order, without every `.strict()` and
   * `.passthrough()` but a winning `.strict()`, as `ObjectInterpretedSchema`
   * removes them: `.passthrough()` adds no post-modifier of its own.
   *
   * ```ts
   * <pvl.object({}).strict().refine(isOk).strict(opts)>.postModifierCalls // [refine(isOk), strict(opts)]
   * <pvl.object({}).strict().passthrough()>.postModifierCalls             // []
   * ```
   */
  public override get postModifierCalls(): ReadonlyArray<SchemaModifierCall> {
    const unknownKeysCall = this.findUnknownKeysCall();
    return super.postModifierCalls.filter(
      (call) =>
        !UNKNOWN_KEYS_METHOD_NAMES.has(call.name) ||
        (call === unknownKeysCall && call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.STRICT),
    );
  }

  /** The last of `.strict()` and `.passthrough()` chained onto it, which wins; `undefined` with neither. */
  private findUnknownKeysCall(): SchemaModifierCall | undefined {
    return [...this.calls].reverse().find((call) => UNKNOWN_KEYS_METHOD_NAMES.has(call.name));
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
