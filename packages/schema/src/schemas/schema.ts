import type { StandardSchemaV1 } from '@standard-schema/spec';
import { VENDOR } from '../consts.js';
import { ISSUE_CODE, Issue, type IssueEditableProps } from '../issue.js';
import type { Result } from '../result.js';
import type { StandardSchemaProps } from '../standardSchema.js';
import { MODIFIER_TAG, type Modifier, type ModifierShape } from '../types.js';

/**
 * How a schema class is rebuilt with new `Input`/`Output` types. A subclass
 * declares a `'~kind'` extending this, whose `type` is the subclass itself
 * re-parameterized with `this['Input']` and `this['Output']`, so a modifier
 * that widens the types still hands back that subclass. Type-only: nothing
 * exists at runtime.
 *
 * @internal
 */
export interface SchemaKind {
  readonly Input: unknown;
  readonly Output: unknown;
  readonly type: Schema;
}

/**
 * `S` rebuilt with `Input` and `Output` through its `'~kind'`, or the base
 * `Schema` for a class that declares none.
 *
 * @internal
 */
export type Rebind<S, Input, Output> = S extends { readonly '~kind': infer Kind extends SchemaKind }
  ? (Kind & { readonly Input: Input; readonly Output: Output })['type']
  : Schema<Input, Output>;

// `_validate` is in the pick even though it is internal: it is what a
// composite calls on each field or element, and requiring it is what keeps a
// Standard Schema from another library from being one (ADR-0018).
/**
 * A schema no modifier can be chained onto: what `.transform()` and
 * `pvl.compile()` hand back. It can still validate a value, and it can still
 * be a field of an object schema, an element of an array schema or a member
 * of a union — but no constraint, `.optional()` or `.refine()` attaches to
 * it, so chain those first.
 *
 * @example
 * ```ts
 * import { pvl, type ReadOnlySchema } from '@pvl/schema';
 *
 * const length: ReadOnlySchema<string, number> = pvl.string().transform((value) => value.length);
 *
 * length.validate('abc'); // { value: 3 }
 * pvl.object({ name: length }).validate({ name: 'Ada' }); // { value: { name: 3 } }
 * ```
 */
export type ReadOnlySchema<Input = unknown, Output = Input> = Pick<
  Schema<Input, Output>,
  'validate' | '~standard' | '_validate'
>;

// What `.transform()` hands back. A transformed object or array is still a
// `pvl.compile()` candidate, so the type-only `'~compileCandidate'` marker
// carries over; its `shape`/`element` do not.
type Transformed<S, Input, Output> = S extends { readonly '~compileCandidate': true }
  ? ReadOnlySchema<Input, Output> & { readonly '~compileCandidate': true }
  : ReadOnlySchema<Input, Output>;

/**
 * The base every schema in this library extends. You never construct one
 * directly — `pvl.string()`, `pvl.object()` and the rest hand you a subclass
 * — and every modifier hands back that same subclass, so its own methods stay
 * chainable whatever order you chain them in. `.transform()` is the
 * exception: it ends the chain with a {@link ReadOnlySchema}.
 *
 * Modifiers run in the order you chain them, so the order can matter:
 * `pvl.string().coerce().optional()` turns `undefined` into `'undefined'`,
 * while `pvl.string().optional().coerce()` accepts it as `undefined`.
 *
 * `Input` is what a value must look like going in; `Output` is what a
 * successful `.validate()` hands back, which differs from `Input` once a
 * `.transform()` is attached.
 *
 * @example
 * ```ts
 * import { pvl, type Schema } from '@pvl/schema';
 *
 * // Still a `StringSchema`, so `.min()` is still there.
 * const nickname = pvl.string().optional().min(2);
 * const asBase: Schema<string | undefined, string | undefined> = nickname;
 *
 * const result = asBase.validate(undefined);
 * result.issues; // undefined — an absent value is accepted
 * ```
 */
export abstract class Schema<Input = unknown, Output = Input> implements StandardSchemaV1<
  Input,
  Output
> {
  // Each runs in chain order, the pre-modifiers before `_checkType` and the
  // post-modifiers after it — see `_validate` and ADR-0010.
  private _preModifiers: ReadonlyArray<Modifier<unknown, unknown>> = [];
  private _postModifiers: ReadonlyArray<Modifier<unknown, unknown>> = [];

  /**
   * The Standard Schema protocol property. Consumers reach for
   * `.validate()`; this exists so any Standard Schema-aware tool can use a
   * `@pvl/schema` schema without knowing about this library.
   *
   * @internal
   */
  get '~standard'(): StandardSchemaProps<Input, Output> {
    return {
      version: 1,
      vendor: VENDOR,
      // Phantom property: never constructed at runtime, only used so
      // `InferInput`/`InferOutput` can read `Input`/`Output` off the type.
      types: undefined as unknown as StandardSchemaV1.Types<Input, Output>,
      validate: (value: unknown): Result<Output> => this.validate(value),
    };
  }

  /**
   * Checks a value against this schema and returns a {@link Result}
   * synchronously. It never throws for an invalid value — a rejection comes
   * back as `issues`, so the two branches are handled the same way every
   * time.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const result = pvl.number().int().validate(1.5);
   * if (result.issues) {
   *   console.log(result.issues[0]?.message); // 'Number must be an integer'
   * } else {
   *   console.log(result.value);
   * }
   * ```
   */
  validate(value: unknown): Result<Output> {
    return this._validate(value, []);
  }

  /**
   * Full-pipeline validation, path-aware so a composite schema can call it on
   * a nested field's schema and get that field's own modifiers applied.
   *
   * @internal
   */
  // The steps are ADR-0010's: pre-modifiers, `_checkType`, post-modifiers,
  // each in chain order. With no tag, a modifier's `null` means continue,
  // `{ issues }` collect and continue, `{ value }` replace and continue; a
  // `MODIFIER_TAG` is how a modifier departs from that.
  _validate(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Output> {
    const issues: Issue[] = [];
    let current = value;
    let shortCircuited = false;

    for (const modifier of this._preModifiers) {
      const result = modifier.fn(current, path, current);
      if (result === null) {
        continue;
      }
      if (result.issues) {
        issues.push(...result.issues);
        continue;
      }
      current = result.value;
      if (modifier.tags?.includes(MODIFIER_TAG.SHORT_CIRCUIT)) {
        shortCircuited = true;
        break;
      }
    }

    // What `_checkType` received, before it built its own output from it.
    const input = current;

    if (!shortCircuited) {
      const checked = this._checkType(current, path);
      // A failed type check leaves nothing for a post-modifier to check.
      if (checked.issues) {
        return { issues: [...issues, ...checked.issues] };
      }
      current = checked.value;
    }

    for (const modifier of this._postModifiers) {
      if (shortCircuited && !modifier.tags?.includes(MODIFIER_TAG.RUNS_AFTER_SHORT_CIRCUIT)) {
        continue;
      }
      if (issues.length > 0 && modifier.tags?.includes(MODIFIER_TAG.REQUIRES_ALL_PASSED)) {
        continue;
      }
      const result = modifier.fn(current, path, input);
      if (result === null) {
        continue;
      }
      if (result.issues) {
        issues.push(...result.issues);
        continue;
      }
      current = result.value;
    }

    // `Output` is a free type parameter the modifiers' own types can't be
    // followed back to.
    return issues.length > 0 ? { issues } : { value: current as Output };
  }

  /**
   * The concrete shape check for this schema type (e.g. "is this a string").
   *
   * @internal
   */
  // `unknown` rather than `Output`: this checks the raw type, before any
  // post-modifier, so once a `.transform()` is attached its value is not
  // `Output` at all.
  abstract _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<unknown>;

  /**
   * The `.coerce()` conversion for this schema type. The base is identity —
   * a schema type with no unambiguous conversion target leaves it that way.
   *
   * @internal
   */
  _coerceInput(value: unknown): unknown {
    return value;
  }

  /**
   * Accepts `undefined` in addition to whatever this schema already accepts.
   * As an object field, it also makes the key itself optional: an omitted key
   * stays omitted from the output rather than becoming an explicit
   * `undefined` property.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const user = pvl.object({ name: pvl.string(), nickname: pvl.string().optional() });
   *
   * user.validate({ name: 'Ada' }); // { value: { name: 'Ada' } }
   * user.validate({ name: 'Ada', nickname: 'Addie' }); // both keys kept
   * ```
   */
  optional(): Rebind<this, Input | undefined, Output | undefined> {
    return this._withPreModifier<Input, Output | undefined>({
      tags: [MODIFIER_TAG.SHORT_CIRCUIT],
      fn: (value) => {
        return value === undefined ? { value: undefined } : null;
      },
    }) as unknown as Rebind<this, Input | undefined, Output | undefined>;
  }

  /**
   * Accepts `null` in addition to whatever this schema already accepts.
   * Unlike `.optional()`, the key stays required — `null` has to be passed
   * explicitly. Chain both to accept either.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const deletedAt = pvl.string().nullable();
   * deletedAt.validate(null); // { value: null }
   *
   * const eitherWay = pvl.string().nullable().optional();
   * ```
   */
  nullable(): Rebind<this, Input | null, Output | null> {
    return this._withPreModifier<Input, Output | null>({
      tags: [MODIFIER_TAG.SHORT_CIRCUIT],
      fn: (value) => {
        return value === null ? { value: null } : null;
      },
    }) as unknown as Rebind<this, Input | null, Output | null>;
  }

  /**
   * Attaches a custom check. The predicate never changes the value; returning
   * `false` produces an `Issue` with code `CUSTOM`. This is where constraints
   * the library has no built-in for — a regex, a cross-field rule — belong.
   *
   * It runs once the value has passed this schema's type check, in the order
   * it was chained among the constraints, so a failing constraint before it
   * does not stop it and both issues are reported. It is skipped for a value
   * `.optional()` or `.nullable()` accepted.
   *
   * The schema comes back as the same type it went in as, so a refined
   * `object` or `array` schema is still one — and still something
   * `pvl.compile()` accepts.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const evenNumber = pvl
   *   .number()
   *   .refine((value) => value % 2 === 0, { message: 'must be even' });
   *
   * evenNumber.validate(3); // { issues: [{ code: 'CUSTOM', message: 'must be even' }] }
   *
   * // Still an object schema, so `pvl.compile()` accepts it.
   * const range = pvl
   *   .object({ min: pvl.number(), max: pvl.number() })
   *   .refine((value) => value.min <= value.max);
   * pvl.compile(range);
   * ```
   */
  // `Output` is wider than the predicate ever sees after `.nullable()` or
  // `.optional()`, since a short-circuited value skips it, which is harmless.
  refine(
    predicate: (value: Output) => boolean,
    issueProps?: IssueEditableProps,
  ): Rebind<this, Input, Output> {
    return this._withPostModifier<Output, Output>({
      fn: (value, path) => {
        return predicate(value)
          ? null
          : { issues: [new Issue(ISSUE_CODE.CUSTOM, path, issueProps?.message)] };
      },
    }) as unknown as Rebind<this, Input, Output>;
  }

  /**
   * Converts an accepted value into a different one, changing the `Output`
   * type to whatever the function returns. It is the last thing to run, and
   * only once nothing has failed, so the function only ever sees a value
   * this schema accepted — unlike `.coerce()`, which runs before the type
   * check. A value `.optional()` or `.nullable()` accepted still reaches it,
   * so the function is typed to receive `undefined` or `null` too.
   *
   * It ends the chain: the result is a {@link ReadOnlySchema}, which can
   * validate but takes no further modifier, so chain those before
   * transforming.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const trimmedLength = pvl.string().transform((value) => value.trim().length);
   *
   * trimmedLength.validate('  hello  '); // { value: 5 }
   * trimmedLength.validate(42); // { issues: [...] } — never reaches the transform
   *
   * const label = pvl.string().nullable().transform((value) => value ?? 'none');
   * label.validate(null); // { value: 'none' }
   * ```
   */
  transform<NewOutput>(fn: (value: Output) => NewOutput): Transformed<this, Input, NewOutput> {
    return this._withPostModifier<Output, NewOutput>({
      tags: [MODIFIER_TAG.REQUIRES_ALL_PASSED, MODIFIER_TAG.RUNS_AFTER_SHORT_CIRCUIT],
      fn: (value) => {
        return { value: fn(value) };
      },
    }) as unknown as Transformed<this, Input, NewOutput>;
  }

  /**
   * Converts the raw input to this schema's type before the type check, so
   * `'42'` can satisfy a number schema. Only the primitives and `literal`
   * have a conversion; on `object`, `array`, `union` and `enum` there is no
   * unambiguous target type, so this is a no-op and a wrong-shaped value is
   * still rejected.
   *
   * It runs where it is chained among `.optional()` and `.nullable()`:
   * `pvl.string().coerce().optional()` turns `undefined` into `'undefined'`,
   * while `pvl.string().optional().coerce()` accepts `undefined` as it is.
   * Constraints always run after the type check, so chaining it after them is
   * fine.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const port = pvl.number().int().min(1).coerce();
   *
   * port.validate('8080'); // { value: 8080 }
   * port.validate('nope'); // { issues: [{ code: 'INVALID_TYPE', ... }] }
   * ```
   */
  coerce(): Rebind<this, unknown, Output> {
    return this._withPreModifier<unknown, unknown>({
      fn: (value) => {
        return { value: this._coerceInput(value) };
      },
    }) as unknown as Rebind<this, unknown, Output>;
  }

  /**
   * A copy of this schema with the same prototype and fields, so a subclass
   * can re-point one of its own fields without dropping a chained modifier.
   *
   * @internal
   */
  protected _clone(): this {
    const clone = Object.create(Object.getPrototypeOf(this) as object) as this;
    Object.assign(clone, this);
    return clone;
  }

  /**
   * A copy of this schema with `modifier` appended to the pre-modifiers,
   * which run before the type check.
   *
   * @internal
   */
  protected _withPreModifier<ModifierInput, ModifierOutput>(
    modifier: Modifier<ModifierInput, ModifierOutput>,
  ): this {
    const clone = this._clone();
    clone._preModifiers = [...this._preModifiers, modifier as Modifier<unknown, unknown>];
    return clone;
  }

  /**
   * A copy of this schema with `modifier` appended to the post-modifiers,
   * which run once the type check has passed.
   *
   * @internal
   */
  protected _withPostModifier<ModifierInput, ModifierOutput>(
    modifier: Modifier<ModifierInput, ModifierOutput>,
  ): this {
    const clone = this._clone();
    clone._postModifiers = [...this._postModifiers, modifier as Modifier<unknown, unknown>];
    return clone;
  }

  // Matched by shape rather than identity, so a caller can remove a modifier
  // without holding on to the instance it added.
  /**
   * A copy of this schema without any modifier built by one of `shapes`.
   *
   * @internal
   */
  protected _withoutModifiers(shapes: ReadonlyArray<ModifierShape>): this {
    const keep = (modifier: Modifier<unknown, unknown>): boolean =>
      modifier.shape === undefined || !shapes.includes(modifier.shape);
    const clone = this._clone();
    clone._preModifiers = this._preModifiers.filter(keep);
    clone._postModifiers = this._postModifiers.filter(keep);
    return clone;
  }
}
