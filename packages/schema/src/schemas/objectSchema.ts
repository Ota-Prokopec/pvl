import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ValueOfEnum } from '@repo/types';
import { buildIssue, ISSUE_CODE, type Issue } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

/**
 * What an object schema does with keys its shape does not declare. Exactly
 * one mode is active per schema: `STRIP` (the default) drops them, `STRICT`
 * reports them as `Issue`s, `PASSTHROUGH` keeps them untyped.
 *
 * @example
 * ```ts
 * import { pvl, UNKNOWN_KEYS } from '@pvl/schema';
 *
 * const strict = pvl.object({ name: pvl.string() }).strict();
 *
 * strict.validate({ name: 'Ada', extra: 1 });
 * // { issues: [{ code: 'UNRECOGNIZED_KEY', path: ['extra'], ... }] }
 *
 * UNKNOWN_KEYS.STRICT; // 'STRICT'
 * ```
 */
export const UNKNOWN_KEYS = {
  STRIP: 'STRIP',
  STRICT: 'STRICT',
  PASSTHROUGH: 'PASSTHROUGH',
} as const;

/**
 * The union of {@link UNKNOWN_KEYS}' values — the mode an object schema
 * carries as its second type parameter.
 *
 * @example
 * ```ts
 * import { UNKNOWN_KEYS, type UnknownKeys } from '@pvl/schema';
 *
 * const keepsExtras = (mode: UnknownKeys): boolean => mode === UNKNOWN_KEYS.PASSTHROUGH;
 * ```
 */
export type UnknownKeys = ValueOfEnum<typeof UNKNOWN_KEYS>;

/**
 * The field schemas an object schema composes, one per declared key.
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

type ShapeInput<Shape extends ObjectShape> = {
  [Key in keyof Shape]: StandardSchemaV1.InferInput<Shape[Key]>;
};

type ShapeOutput<Shape extends ObjectShape> = {
  [Key in keyof Shape]: StandardSchemaV1.InferOutput<Shape[Key]>;
};

// The keys a caller may leave out entirely. A field whose schema is
// `.optional()` widens to include `undefined`, which is the only signal the
// composed type has that the key itself is optional rather than required and
// possibly undefined.
type OptionalFieldKeys<Fields> = {
  [Key in keyof Fields]-?: undefined extends Fields[Key] ? Key : never;
}[keyof Fields];

// Re-maps an intersection into one flat object type, preserving `?` modifiers.
type Flatten<Fields> = { [Key in keyof Fields]: Fields[Key] };

// The per-field types composed into a single object type, `?` applied.
type ComposeObject<Fields> = Flatten<
  {
    [Key in Exclude<keyof Fields, OptionalFieldKeys<Fields>>]: Fields[Key];
  } & {
    [Key in OptionalFieldKeys<Fields>]?: Fields[Key];
  }
>;

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
export type ObjectInput<Shape extends ObjectShape> = ComposeObject<ShapeInput<Shape>>;

/**
 * The object type a successful validation hands back. `.passthrough()` adds
 * an `unknown`-valued index signature alongside the declared keys, because
 * unrecognized keys survive into the output; the other two modes output the
 * declared keys only.
 *
 * @example
 * ```ts
 * import { pvl, UNKNOWN_KEYS, type ObjectOutput } from '@pvl/schema';
 *
 * const shape = { name: pvl.string() };
 *
 * type Stripped = ObjectOutput<typeof shape, typeof UNKNOWN_KEYS.STRIP>; // { name: string }
 * type Kept = ObjectOutput<typeof shape, typeof UNKNOWN_KEYS.PASSTHROUGH>;
 * // { name: string } & Record<string, unknown>
 * ```
 */
export type ObjectOutput<
  Shape extends ObjectShape,
  Mode extends UnknownKeys,
> = Mode extends typeof UNKNOWN_KEYS.PASSTHROUGH
  ? ComposeObject<ShapeOutput<Shape>> & Record<string, unknown>
  : ComposeObject<ShapeOutput<Shape>>;

// What `.passthrough()` does to an output type that a modifier may already
// have widened. Distributive, so `{ … } | undefined` gains the index
// signature on the object branch and leaves the `undefined` branch alone.
type WithUnknownKeys<Output> = Output extends object ? Output & Record<string, unknown> : Output;

// Plain `target[key] = value` would hit `Object.prototype`'s `__proto__`
// setter for that one key name — which `JSON.parse('{"__proto__":{}}')`
// produces as a real own property — silently reparenting the output instead of
// copying the key. `defineProperty` writes it as the own data property it was.
const assignKey = (target: Record<string, unknown>, key: string, value: unknown): void => {
  if (key === '__proto__') {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return;
  }
  target[key] = value;
};

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
 * Unknown keys are stripped by default; `.strict()` and `.passthrough()`
 * change that. `.coerce()` is inherited but does nothing here — there is no
 * unambiguous way to read an object out of a non-object. A field that needs
 * coercion opts into it on its own schema.
 *
 * `.optional()`, `.nullable()`, `.refine()` and `.transform()` hand back an
 * object schema rather than the base `Schema`, so a modified object schema is
 * still something `pvl.compile()` accepts, and `.strict()`/`.passthrough()`
 * carry an earlier modifier's types through. Chaining order is free in both
 * directions.
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
  Mode extends UnknownKeys = typeof UNKNOWN_KEYS.STRIP,
  Input = ObjectInput<Shape>,
  Output = ObjectOutput<Shape, Mode>,
> extends Schema<Input, Output> {
  private readonly _typeMessage: string;
  // `Mode` is a type-level marker for the output type only; the runtime field
  // is the plain union, so the clone below can re-point it without a cast.
  private _unknownKeys: UnknownKeys = UNKNOWN_KEYS.STRIP;
  private _unknownKeyMessage: string | undefined;
  // Derived from the shape once at construction rather than per `.validate()`
  // call, since both sit on the validation hot path.
  private readonly _fields: ReadonlyArray<readonly [string, Schema<unknown, unknown>]>;
  private readonly _declaredKeys: ReadonlySet<string>;
  // Its own copy of the argument, for the same reason the two derived fields
  // above are snapshots: the caller still holds the object literal they passed
  // in, and mutating it after construction must not make `shape` report a
  // field `_fields` will never validate against.
  private readonly _shape: Shape;

  /** @internal */
  constructor(shape: Shape, options?: SchemaOptions) {
    super();
    this._typeMessage = options?.message ?? 'Expected object';
    // Spreading a generic widens to its constraint, which is what the
    // assertion restores; the copy is per-construction, not per-`.validate()`.
    this._shape = { ...shape } as Shape;
    this._fields = Object.entries(shape);
    this._declaredKeys = new Set(Object.keys(shape));
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
   * `.strict()` and `.passthrough()` are mutually exclusive; the last one
   * applied wins.
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
  strict(options?: SchemaOptions): ObjectSchema<Shape, typeof UNKNOWN_KEYS.STRICT, Input, Output> {
    return this._withUnknownKeys(UNKNOWN_KEYS.STRICT, options?.message) as ObjectSchema<
      Shape,
      typeof UNKNOWN_KEYS.STRICT,
      Input,
      Output
    >;
  }

  /**
   * Keeps keys the shape does not declare, untyped, instead of stripping
   * them. The output type gains an `unknown`-valued index signature, so
   * reading an undeclared key still forces a narrowing step.
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
  passthrough(): ObjectSchema<
    Shape,
    typeof UNKNOWN_KEYS.PASSTHROUGH,
    Input,
    WithUnknownKeys<Output>
  > {
    return this._withUnknownKeys(UNKNOWN_KEYS.PASSTHROUGH) as ObjectSchema<
      Shape,
      typeof UNKNOWN_KEYS.PASSTHROUGH,
      Input,
      WithUnknownKeys<Output>
    >;
  }

  // The three overrides below only re-state a type: the base modifier
  // already hands back this instance's prototype-preserving clone, so the
  // value is an `ObjectSchema` — the compiler just cannot follow the clone
  // back to this class, and the base signature widens to `Schema`.
  /**
   * Accepts `undefined` in addition to the object this schema describes,
   * keeping it an object schema — so it can still be handed to
   * `pvl.compile()` and still carries `.strict()`/`.passthrough()`.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const address = pvl.object({ city: pvl.string() }).optional();
   *
   * address.validate(undefined); // { value: undefined }
   * pvl.compile(address); // still a composite schema
   * ```
   */
  override optional(): ObjectSchema<Shape, Mode, Input | undefined, Output | undefined> {
    return super.optional() as ObjectSchema<Shape, Mode, Input | undefined, Output | undefined>;
  }

  /**
   * Accepts `null` in addition to the object this schema describes, keeping
   * it an object schema.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const address = pvl.object({ city: pvl.string() }).nullable();
   *
   * address.validate(null); // { value: null }
   * ```
   */
  override nullable(): ObjectSchema<Shape, Mode, Input | null, Output | null> {
    return super.nullable() as ObjectSchema<Shape, Mode, Input | null, Output | null>;
  }

  /**
   * Converts the accepted object into a different value, changing what
   * `.validate()` hands back while leaving this an object schema — the shape
   * it validates going in is unchanged, so `pvl.compile()` still accepts it.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const fullName = pvl
   *   .object({ first: pvl.string(), last: pvl.string() })
   *   .transform((value) => `${value.first} ${value.last}`);
   *
   * fullName.validate({ first: 'Ada', last: 'Lovelace' }); // { value: 'Ada Lovelace' }
   * ```
   */
  override transform<NewOutput>(
    fn: (value: Output) => NewOutput,
  ): ObjectSchema<Shape, Mode, Input, NewOutput> {
    return super.transform(fn) as ObjectSchema<Shape, Mode, Input, NewOutput>;
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Output> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_TYPE, this._typeMessage, path)],
      };
    }

    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    const issues: Issue[] = [];

    for (const [key, field] of this._fields) {
      const result = field._validate(input[key], [...path, key]);
      if (result.issues) {
        issues.push(...result.issues);
        continue;
      }
      // An omitted optional field stays omitted rather than becoming an
      // explicit `undefined` property of the output.
      if (result.value === undefined && !Object.hasOwn(input, key)) {
        continue;
      }
      assignKey(output, key, result.value);
    }

    if (this._unknownKeys !== UNKNOWN_KEYS.STRIP) {
      for (const key of Object.keys(input)) {
        if (this._declaredKeys.has(key)) {
          continue;
        }
        if (this._unknownKeys === UNKNOWN_KEYS.STRICT) {
          issues.push(
            buildIssue(
              ISSUE_CODE.UNRECOGNIZED_KEY,
              this._unknownKeyMessage ?? `Unrecognized key "${key}"`,
              [...path, key],
            ),
          );
          continue;
        }
        assignKey(output, key, input[key]);
      }
    }

    if (issues.length > 0) {
      return { issues };
    }
    // The loops above built `output` key by key from each field's own result,
    // which the type system can't follow back to the composed object type.
    // `Output` is a free type parameter — a modifier may have widened it past
    // the composed type — so the assertion goes through `unknown`.
    return { value: output as unknown as Output };
  }

  // Clones through the base class's prototype-preserving clone, so any
  // modifier already chained onto this instance survives, then re-points the
  // unknown-key fields. Constructing a fresh `ObjectSchema` instead would
  // reset the base `Schema` state and silently drop those modifiers. The two
  // callers re-state the mode and, for `.passthrough()`, the output — `Mode`
  // is a type-level marker the runtime has no equivalent of.
  private _withUnknownKeys(unknownKeys: UnknownKeys, unknownKeyMessage?: string): this {
    const clone = this._withState({});
    clone._unknownKeys = unknownKeys;
    clone._unknownKeyMessage = unknownKeyMessage;
    return clone;
  }
}
