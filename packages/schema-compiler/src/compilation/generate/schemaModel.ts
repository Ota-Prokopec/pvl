// What the compiler knows about a Schema once it is read from source: the
// factory that built it, that factory's arguments, and every method chained
// onto it, in chain order. Nothing here is executed; it is plain data.
import type { EnumMember, PossibleLiteralValue } from '@pvl/schema';
import type { SCHEMA_FACTORY } from '../../enums.js';

/** An argument written as a literal in source: `3`, `'a'`, `10n`, `{ message: 'too short' }`. */
export type StaticValue =
  | string
  | number
  | boolean
  | bigint
  | ReadonlyArray<StaticValue>
  | { readonly [key: string]: StaticValue };

/** One method chained onto a Schema: `.min(3, { message: 'too short' })`. */
export type SchemaMethodCall = {
  name: string;
  /** `undefined` when an argument isn't a literal, such as `.refine()`'s function. */
  args: ReadonlyArray<StaticValue> | undefined;
  /** The 1-based line it is written on. */
  line: number;
};

/** One field of an object Schema. */
export type ObjectField = {
  key: string;
  schema: SchemaModel;
};

type SchemaModelWithCalls<Model> = Model & {
  /** Every method chained onto the factory call, in chain order. */
  calls: ReadonlyArray<SchemaMethodCall>;
  /** The 1-based line the factory call is written on. */
  line: number;
};

/**
 * A Schema as read from source.
 *
 * ```ts
 * pvl.object({ name: pvl.string().min(3) }).strict()
 * // { factory: 'object', calls: [{ name: 'strict', args: [] }],
 * //   shape: [{ key: 'name', schema: { factory: 'string', calls: [{ name: 'min', args: [3] }] } }] }
 * ```
 */
export type SchemaModel = SchemaModelWithCalls<
  | {
      factory:
        | typeof SCHEMA_FACTORY.STRING
        | typeof SCHEMA_FACTORY.NUMBER
        | typeof SCHEMA_FACTORY.BOOLEAN
        | typeof SCHEMA_FACTORY.BIGINT;
    }
  | { factory: typeof SCHEMA_FACTORY.LITERAL; literalValue: PossibleLiteralValue }
  | { factory: typeof SCHEMA_FACTORY.ENUM; members: ReadonlyArray<EnumMember> }
  | { factory: typeof SCHEMA_FACTORY.OBJECT; shape: ReadonlyArray<ObjectField> }
  | { factory: typeof SCHEMA_FACTORY.ARRAY; element: SchemaModel }
  | { factory: typeof SCHEMA_FACTORY.UNION; members: ReadonlyArray<SchemaModel> }
>;
