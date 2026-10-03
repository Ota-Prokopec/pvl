import { ISSUE_CODE, Issue, type IssueEditableProps } from '../issue.js';
import {
  UNKNOWN_KEYS_MODIFIERS,
  unknownKeysStrictModifier,
  unknownKeysStripModifier,
} from '../modifiers.js';
import type { Result } from '../result.js';
import type { InferInput, InferOutput, SchemaKind } from '../types.js';
import { assignObjectProperty, unknownKeysOfObject } from '../utils.js';
import { ChainableSchema } from './chainableSchema.js';
import type { Schema } from './schema.js';

/**
 * The field schemas an object schema composes, one per declared key. A field
 * is any `@pvl/schema` Schema — including a transformed or compiled one — but
 * never a schema from another library.
 *
 * @example
 * ```ts
 * import { pvl, type ObjectShape } from '@pvl/schema';
 *
 * const shape = {
 *   name: pvl.string(),
 *   age: pvl.number().int(),
 * } satisfies ObjectShape;
 *
 * const user = pvl.object(shape);
 * ```
 */
export type ObjectShape = Readonly<Record<string, Schema<unknown, unknown>>>;

// The per-field types composed into a single object type. A field whose type
// admits `undefined` (its schema is `.optional()`) becomes a `?` key — the
// only signal the composed type has that the key itself may be left out.
// `Composed` is a local, not a parameter: re-mapping it flattens the
// intersection into one object type while keeping each `?`.
type ComposeObject<
  Fields,
  Composed = {
    [Key in keyof Fields as undefined extends Fields[Key] ? never : Key]: Fields[Key];
  } & {
    [Key in keyof Fields as undefined extends Fields[Key] ? Key : never]?: Fields[Key];
  },
> = { [Key in keyof Composed]: Composed[Key] };

/**
 * The object type a value must match going in, composed from each field
 * schema's own input type. A field whose schema is `.optional()` becomes an
 * optional key.
 *
 * It is the same in every unknown-key mode: extra keys are a property of the
 * value handed in, not of what the schema asks for, and `.strict()` rejects
 * them at runtime rather than at the type level.
 *
 * @example
 * ```ts
 * import { pvl, type ObjectInput } from '@pvl/schema';
 *
 * const shape = { name: pvl.string(), nickname: pvl.string().optional() };
 *
 * const input: ObjectInput<typeof shape> = { name: 'Ada' }; // nickname is optional
 * pvl.object(shape).validate(input);
 * ```
 */
export type ObjectInput<Shape extends ObjectShape> = ComposeObject<{
  [Key in keyof Shape]: InferInput<Shape[Key]>;
}>;

/**
 * The object type a successful validation hands back, composed from each
 * field schema's own output type. It lists the declared keys only;
 * `.passthrough()` adds an `unknown`-valued index signature alongside them.
 *
 * @example
 * ```ts
 * import { pvl, type ObjectOutput } from '@pvl/schema';
 *
 * const shape = { name: pvl.string(), age: pvl.string().transform(Number) };
 *
 * type User = ObjectOutput<typeof shape>; // { name: string; age: number }
 * ```
 */
export type ObjectOutput<Shape extends ObjectShape> = ComposeObject<{
  [Key in keyof Shape]: InferOutput<Shape[Key]>;
}>;

// What `.passthrough()` does to an output type that a modifier may already
// have widened. Distributive, so `{ … } | undefined` gains the index
// signature on the object branch and leaves the `undefined` branch alone.
type WithUnknownKeys<Output> = Output extends object ? Output & Record<string, unknown> : Output;

interface ObjectSchemaKind<Shape extends ObjectShape> extends SchemaKind<
  ObjectSchema<Shape, unknown, unknown>
> {
  readonly type: ObjectSchema<Shape, this['Input'], this['Output']>;
}

/**
 * Validates each declared key against its own field schema, composing those
 * schemas into one object type. Build one with `pvl.object(shape)`.
 *
 * Every field is checked even after an earlier one fails, so a single
 * `Result` carries one `Issue` per failing field rather than one per
 * round-trip. Each field runs through its own full pipeline — its
 * `.optional()`, `.nullable()`, `.coerce()`, `.refine()`, `.transform()` —
 * with the field's key appended to the path.
 *
 * Unknown keys are stripped by default, so the output holds the declared keys
 * only; `.strict()` reports them as issues instead and `.passthrough()` keeps
 * them. `.coerce()` is inherited but does nothing here — there is no
 * unambiguous way to read an object out of a non-object. A field that needs
 * coercion opts into it on its own schema.
 *
 * Every modifier hands back an object schema rather than the base `ChainableSchema`,
 * so a modified object schema is still something `pvl.compile()` accepts,
 * and `.strict()`/`.passthrough()` carry an earlier modifier's types through.
 * `.transform()` ends the chain.
 *
 * @example
 * ```ts
 * import { pvl } from '@pvl/schema';
 *
 * const user = pvl.object({
 *   name: pvl.string().min(1),
 *   age: pvl.number().int().min(0),
 *   nickname: pvl.string().optional(),
 * });
 *
 * user.validate({ name: 'Ada', age: 36, extra: true });
 * // { value: { name: 'Ada', age: 36 } } — `extra` is stripped
 *
 * user.validate({ name: '', age: 1.5 });
 * // { issues: [{ path: ['name'], ... }, { path: ['age'], ... }] } — both fields reported
 * ```
 */
export class ObjectSchema<
  Shape extends ObjectShape,
  Input = ObjectInput<Shape>,
  Output = ObjectOutput<Shape>,
> extends ChainableSchema<Input, Output> {
  declare readonly '~kind': ObjectSchemaKind<Shape>;
  // Derived from the shape once at construction rather than per `.validate()`
  private readonly _shapeKeys: ReadonlySet<string>;

  private readonly _shape: Shape;

  /** @internal */
  constructor(shape: Shape) {
    const shapeKeys = new Set(Object.keys(shape));
    super({ postModifiers: [unknownKeysStripModifier(shapeKeys)] });
    // Spreading a generic widens to its constraint, which is what the
    // assertion restores; the copy is per-construction, not per-`.validate()`.
    this._shape = { ...shape } as Shape;
    this._shapeKeys = shapeKeys;
  }

  // An accessor with no setter, returning `Readonly<Shape>`, so neither the
  // shape nor any one key can be written — a per-key write would otherwise
  // typecheck and then silently do nothing, since `_fields` is already fixed.
  // Per the parent spec nothing is frozen at runtime: immutability below the
  // accessor is the type system's job. The schemas handed back are the very
  // instances the caller declared, so their own modifiers come with them, and
  // `@pvl/schema-compiler`'s Compiled Schemas expose `shape` too, so a call
  // site written against an interpreted schema survives the import swap.
  /**
   * The schema declared for each key of this object schema, so a single field
   * can be reached and validated on its own without validating the whole
   * object. A composite field carries its own `shape` or `element`, so nested
   * structure is reachable all the way down.
   *
   * Read-only: neither the shape nor any one field can be replaced, and
   * reading a field never affects how this schema validates.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const user = pvl.object({
   *   name: pvl.string().min(1),
   *   address: pvl.object({ city: pvl.string() }),
   * });
   *
   * user.shape.name.validate('Ada'); // { value: 'Ada' }
   * user.shape.name.validate(''); // { issues: [{ code: 'TOO_SMALL', ... }] }
   * user.shape.address.shape.city.validate('London'); // { value: 'London' }
   * ```
   */
  get shape(): Readonly<Shape> {
    return this._shape;
  }

  /**
   * Reports keys the shape does not declare as `Issue`s instead of stripping
   * them — one `UNRECOGNIZED_KEY` issue per extra key, pathed to that key.
   * Use it where an unexpected key means a typo or a stale caller rather than
   * harmless extra data.
   *
   * An object with a failing field reports only the field issues; its
   * unknown keys are reported once every field passes. `.strict()` and
   * `.passthrough()` are mutually exclusive; the last one chained wins.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const config = pvl.object({ port: pvl.number() }).strict();
   *
   * config.validate({ port: 80, prot: 443 });
   * // { issues: [{ code: 'UNRECOGNIZED_KEY', path: ['prot'], ... }] }
   * ```
   */
  strict(options?: IssueEditableProps): this {
    return this._withoutModifiers(UNKNOWN_KEYS_MODIFIERS)._withPostModifier(
      unknownKeysStrictModifier(this._shapeKeys, options),
    );
  }

  /**
   * Keeps the keys the shape does not declare instead of stripping them, and
   * adds them to the output type as an `unknown`-valued index signature, so
   * reading one still forces a narrowing step. It undoes an earlier
   * `.strict()`.
   *
   * It sets the mode for the whole schema rather than at its place in the
   * chain: every `.refine()` sees the undeclared keys, whether chained before
   * or after it.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const envelope = pvl.object({ id: pvl.string() }).passthrough();
   *
   * envelope.validate({ id: 'a1', meta: { source: 'api' } });
   * // { value: { id: 'a1', meta: { source: 'api' } } }
   * ```
   */
  passthrough(): ObjectSchema<Shape, Input, WithUnknownKeys<Output>> {
    return this._withoutModifiers(UNKNOWN_KEYS_MODIFIERS) as unknown as ObjectSchema<
      Shape,
      Input,
      WithUnknownKeys<Output>
    >;
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Output> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {
        issues: [new Issue(ISSUE_CODE.INVALID_TYPE, path, 'Expected object')],
      };
    }

    const input = value as Record<string, unknown>;
    // Every key is kept, the undeclared ones as they came in: stripping them
    // is the default post-modifier's job, which `.strict()` and
    // `.passthrough()` remove.
    const output: Record<string, unknown> = {};
    const issues: Issue[] = [];

    for (const [childKey, childSchema] of Object.entries(this._shape)) {
      const result = childSchema._validate(input[childKey], [...path, childKey]);
      if (result.issues) {
        issues.push(...result.issues);
        continue;
      }
      // An omitted optional field stays omitted rather than becoming an
      // explicit `undefined` property of the output.
      if (result.value === undefined && !Object.hasOwn(input, childKey)) {
        continue;
      }

      assignObjectProperty(output, childKey, result.value);
    }

    if (issues.length > 0) {
      return { issues };
    }

    for (const key of unknownKeysOfObject(input, this._shapeKeys)) {
      assignObjectProperty(output, key, input[key]);
    }

    // The loops above wrote each field's own result, which the type system
    // can't follow back to the composed object type.
    // `Output` is a free type parameter — a modifier may have widened it past
    // the composed type — so the assertion goes through `unknown`.
    return { value: output as unknown as Output };
  }
}
