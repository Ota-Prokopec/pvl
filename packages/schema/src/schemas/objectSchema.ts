import { ISSUE_CODE, Issue, type IssueEditableProps } from '../issue.js';
import type { Result } from '../result.js';
import type { InferInput, InferOutput, Modifier } from '../types.js';
import { Schema, type SchemaKind } from './schema.js';

/**
 * The field schemas an object schema composes, one per declared key. A field
 * is any {@link StandartSchema} — a `pvl.*` schema or a Compiled Schema —
 * but never a schema from another library.
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

// The unknown-key modifiers run as post-modifiers, once `_checkType` has
// accepted the value, so it is a plain object by then.
const unknownKeysOf = (value: unknown, declaredKeys: ReadonlySet<string>): string[] =>
  Object.keys(value as Record<string, unknown>).filter((key) => !declaredKeys.has(key));

const unknownKeysStrictModifier = (
  declaredKeys: ReadonlySet<string>,
  options?: IssueEditableProps,
): Modifier<unknown, unknown> => ({
  shape: unknownKeysStrictModifier,
  fn: (value, path) => {
    const issues = unknownKeysOf(value, declaredKeys).map(
      (key) =>
        new Issue(
          ISSUE_CODE.UNRECOGNIZED_KEY,
          [...path, key],
          options?.message ?? `Unrecognized key "${key}"`,
        ),
    );
    return issues.length > 0 ? { issues } : null;
  },
});

const unknownKeysStripModifier = (
  declaredKeys: ReadonlySet<string>,
): Modifier<unknown, unknown> => ({
  shape: unknownKeysStripModifier,
  fn: (value) => {
    // Copied rather than edited in place, since the value may be one the
    // caller still holds. Spread defines each key as an own property, so
    // `__proto__` is copied, not set.
    const output: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const key of unknownKeysOf(value, declaredKeys)) {
      delete output[key];
    }
    return { value: output };
  },
});

// Every unknown-key modifier, removed before `.strict()`, `.strip()` or
// `.passthrough()` applies its own so the last one chained wins. There is no
// passthrough modifier: `_checkType` already keeps every key.
const UNKNOWN_KEYS_MODIFIERS = [unknownKeysStrictModifier, unknownKeysStripModifier];

interface ObjectSchemaKind<Shape extends ObjectShape> extends SchemaKind {
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
 * Unknown keys are kept by default, though the output type lists only the
 * declared keys; `.strict()` rejects them, `.strip()` drops them and
 * `.passthrough()` adds them to the type. `.coerce()` is inherited but does nothing here — there is no
 * unambiguous way to read an object out of a non-object. A field that needs
 * coercion opts into it on its own schema.
 *
 * `.optional()`, `.nullable()` and `.refine()` hand back an object schema
 * rather than the base `Schema`, so a modified object schema is still
 * something `pvl.compile()` accepts, and `.strict()`/`.passthrough()` carry
 * an earlier modifier's types through. `.transform()` ends the chain.
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
 * // { value: { name: 'Ada', age: 36, extra: true } } — `extra` is kept
 *
 * user.validate({ name: '', age: 1.5 });
 * // { issues: [{ path: ['name'], ... }, { path: ['age'], ... }] } — both fields reported
 * ```
 */
export class ObjectSchema<
  Shape extends ObjectShape,
  Input = ObjectInput<Shape>,
  Output = ObjectOutput<Shape>,
> extends Schema<Input, Output> {
  declare readonly '~kind': ObjectSchemaKind<Shape>;
  // Derived from the shape once at construction rather than per `.validate()`
  private readonly _declaredKeys: ReadonlySet<string>;

  private readonly _shape: Shape;

  /** @internal */
  constructor(shape: Shape) {
    super();
    // Spreading a generic widens to its constraint, which is what the
    // assertion restores; the copy is per-construction, not per-`.validate()`.
    this._shape = { ...shape } as Shape;
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
   * Reports keys the shape does not declare as `Issue`s instead of keeping
   * them — one `UNRECOGNIZED_KEY` issue per extra key, pathed to that key.
   * Use it where an unexpected key means a typo or a stale caller rather than
   * harmless extra data.
   *
   * It runs after the fields are checked, so an object with a failing field
   * reports only the field issues; its unknown keys are reported once every
   * field passes. `.strict()`, `.strip()` and `.passthrough()` are mutually
   * exclusive; the last one applied wins.
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
      unknownKeysStrictModifier(this._declaredKeys, options),
    );
  }

  /**
   * Drops the keys the shape does not declare from the output instead of
   * keeping them, so the value matches what its type lists. It undoes an
   * earlier `.strict()` or `.passthrough()`.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const user = pvl.object({ name: pvl.string() }).strip();
   *
   * user.validate({ name: 'Ada', extra: true }); // { value: { name: 'Ada' } }
   * ```
   */
  strip(): this {
    return this._withoutModifiers(UNKNOWN_KEYS_MODIFIERS)._withPostModifier(
      unknownKeysStripModifier(this._declaredKeys),
    );
  }

  /**
   * Adds the keys the shape does not declare to the output type, as an
   * `unknown`-valued index signature, so reading one still forces a narrowing
   * step. They are kept at runtime anyway; this also undoes an earlier
   * `.strict()` or `.strip()`.
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
  passthrough(): ObjectSchema<Shape, Input, Output> {
    // `_checkType` already keeps every key, so passing them through is just
    // removing a `.strict()` or `.strip()` chained earlier.
    return this._withoutModifiers(UNKNOWN_KEYS_MODIFIERS) as unknown as ObjectSchema<
      Shape,
      Input,
      Output
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
    // Starts as a copy of the whole input, so unknown keys are kept by default
    // and `.strict()`/`.strip()` see them as a post-modifier. Spread defines
    // each key as an own property, so `__proto__` is copied, not set.
    const output: Record<string, unknown> = { ...input };
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

      assignKey(output, childKey, result.value);
    }

    if (issues.length > 0) {
      return { issues };
    }

    // The loop above wrote each field's own result over the copy, which the
    // type system can't follow back to the composed object type.
    // `Output` is a free type parameter — a modifier may have widened it past
    // the composed type — so the assertion goes through `unknown`.
    return { value: output as unknown as Output };
  }
}
