import type { StandardSchemaV1 } from '@standard-schema/spec';
import { VENDOR } from '../consts.js';
import { ISSUE_CODE, Issue, type IssueEditableProps } from '../issue.js';
import type { Result } from '../result.js';
import type { StandartSchema, StandartSchemaProps } from '../standartSchema.js';
import type { Modifier } from '../types.js';

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
  readonly type: unknown;
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

/**
 * What `.transform()` hands back. It only validates: no constraint or
 * modifier chains onto it, so nothing can run against the transformed value.
 * It is still a Standard Schema, so it can be an object field or an array
 * element.
 *
 * @example
 * ```ts
 * import { pvl, type TransformedSchema } from '@pvl/schema';
 *
 * const length: TransformedSchema<string, number> = pvl.string().transform((value) => value.length);
 *
 * length.validate('abc'); // { value: 3 }
 * ```
 */
export type TransformedSchema<Input, Output> = StandartSchema<Input, Output> & {
  validate(value: unknown): Result<Output>;
};

/**
 * The base every schema in this library extends. You never construct one
 * directly — `pvl.string()`, `pvl.object()` and the rest hand you a subclass
 * — and a modifier that widens the types (`.optional()`, `.nullable()`,
 * `.coerce()`) hands back that same subclass, so its own methods stay
 * chainable. `.transform()` is the exception: it ends the chain.
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
  private preModifiers: Modifier<unknown, unknown>[] = [];
  private postModifiers: Modifier<unknown, unknown>[] = [];

  /**
   * The Standard Schema protocol property. Consumers reach for
   * `.validate()`; this exists so any Standard Schema-aware tool can use a
   * `@pvl/schema` schema without knowing about this library.
   *
   * @internal
   */
  get '~standard'(): StandartSchemaProps<Input, Output> {
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
   * a nested field's schema and get that field's own
   * optional/nullable/coerce/refine/transform behavior applied.
   *
   * @internal
   */
  _validate(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Output> {
    // A loop rather than `forEach`, so a modifier's Result can return from
    // `_validate` itself.
    for (const modifier of this.preModifiers) {
      const modifierResult = modifier.fn(value, path);

      if (modifierResult) {
        return modifierResult as Result<Output>;
      }
    }

    const result = this._checkType(value, path);
    if (result.issues) {
      return result as Result<Output>;
    }

    return this.postModifiers.reduce<Result<unknown>>((current, modifier) => {
      if (current.issues) {
        return current;
      }
      return modifier.fn(current.value, path) ?? current;
    }, result) as Result<Output>;
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
      fn: (value) => {
        return value === null ? { value: null } : null;
      },
    }) as unknown as Rebind<this, Input | null, Output | null>;
  }

  /**
   * Attaches a custom check that runs after this schema's own checks pass.
   * The predicate never changes the value; returning `false` produces an
   * `Issue` with code `CUSTOM`. This is where constraints the library has no
   * built-in for — a regex, a cross-field rule — belong.
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
  // Returns `this` rather than `Schema<Input, Output>`: a Refinement leaves
  // both types alone, so there is nothing to widen, and keeping the concrete
  // class is what lets a refined composite still be a `pvl.compile()`
  // candidate.
  refine(predicate: (value: Output) => boolean, issueProps?: IssueEditableProps): this {
    return this._withPostModifier<Output, Output>({
      fn: (value, path) => {
        const refineResult = predicate(value);

        return !refineResult
          ? { issues: [new Issue(ISSUE_CODE.CUSTOM, path, issueProps?.message)] }
          : null;
      },
    });
  }

  /**
   * Converts an accepted value into a different one, changing the `Output`
   * type to whatever the function returns. It runs after validation passes,
   * so the function only ever sees a value this schema accepted — unlike
   * `.coerce()`, which runs before.
   *
   * It ends the chain: the result is a {@link TransformedSchema}, which can
   * validate but carries no constraints or modifiers, so chain those before
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
   * ```
   */
  transform<NewOutput>(fn: (value: Output) => NewOutput): TransformedSchema<Input, NewOutput> {
    return this._withPostModifier<Output, NewOutput>({
      fn: (value) => {
        return { value: fn(value) };
      },
    }) as unknown as TransformedSchema<Input, NewOutput>;
  }

  /**
   * Converts the raw input to this schema's type before any check runs, so
   * `'42'` can satisfy a number schema. Only the primitives and `literal`
   * have a conversion; on `object`, `array`, `union` and `enum` there is no
   * unambiguous target type, so this is a no-op and a wrong-shaped value is
   * still rejected.
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
    return this.transform((value) => this._coerceInput(value) as Output) as unknown as Rebind<
      this,
      unknown,
      Output
    >;
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

  protected _withPreModifier<Input, Output>(newModifier: Modifier<Input, Output>): this {
    const clone = this._clone();
    clone.preModifiers = [...this.preModifiers, newModifier as Modifier<unknown, unknown>];
    return clone;
  }

  protected _withPostModifier<Input, Output>(newModifier: Modifier<Input, Output>): this {
    const clone = this._clone();
    clone.postModifiers = [...this.postModifiers, newModifier as Modifier<unknown, unknown>];
    return clone;
  }
}
