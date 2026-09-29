import type { StandardSchemaV1 } from '@standard-schema/spec';
import { VENDOR } from '../consts.js';
import type { Result } from '../result.js';
import {
  DEFAULT_STATE,
  resolveShortCircuit,
  runSteps,
  type RefineStep,
  type SchemaState,
  type TransformStep,
} from './schemaState.js';

/**
 * The trailing options object every schema factory and constraint method
 * accepts. `message` replaces the default `Issue` message that call would
 * otherwise produce; it is the only way to customise a message.
 *
 * @example
 * ```ts
 * import { pvl, type SchemaOptions } from '@pvl/schema';
 *
 * const options: SchemaOptions = { message: 'must be at least 3 characters' };
 * const username = pvl.string().min(3, options);
 * ```
 */
export type SchemaOptions = {
  readonly message?: string;
};

// `.optional()`/`.nullable()`/`.refine()`/`.transform()`/`.coerce()` are
// instance state on this class (flags plus one ordered step list) rather than
// wrapper subclasses — see docs/adr/0010-schema-modifier-ordered-step-list.md.
// This avoids a circular ESM import that wrapper classes extending `Schema`
// while `Schema` constructs them would otherwise create.
/**
 * The base every schema in this library extends. You never construct one
 * directly — `pvl.string()`, `pvl.object()` and the rest hand you a subclass
 * — but you meet it as a return type, because a modifier that widens a
 * primitive's types (`.optional()`, `.nullable()`, `.coerce()`,
 * `.transform()`) hands back this base rather than the primitive class.
 *
 * `Input` is what a value must look like going in; `Output` is what a
 * successful `.validate()` hands back, which differs from `Input` once a
 * `.transform()` is attached.
 *
 * @example
 * ```ts
 * import { pvl, type Schema } from '@pvl/schema';
 *
 * // `.optional()` returns the base type, not `StringSchema`.
 * const nickname: Schema<string | undefined, string | undefined> = pvl.string().optional();
 *
 * const result = nickname.validate(undefined);
 * result.issues; // undefined — an absent value is accepted
 * ```
 */
export abstract class Schema<Input = unknown, Output = Input> implements StandardSchemaV1<
  Input,
  Output
> {
  private _state: SchemaState = DEFAULT_STATE;

  /**
   * The Standard Schema protocol property. Consumers reach for
   * `.validate()`; this exists so any Standard Schema-aware tool can use a
   * `@pvl/schema` schema without knowing about this library.
   *
   * @internal
   */
  get '~standard'(): StandardSchemaV1.Props<Input, Output> {
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
    const input = this._state.shouldCoerce ? this._coerceInput(value) : value;

    const shortCircuited = resolveShortCircuit<Output>({ state: this._state, input });
    if (shortCircuited) {
      return shortCircuited;
    }

    const result = this._checkType(input, path);
    if (result.issues) {
      return result;
    }

    return runSteps<Output>({ steps: this._state.steps, value: result.value, path });
  }

  /**
   * The concrete shape check for this schema type (e.g. "is this a string").
   *
   * @internal
   */
  abstract _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Output>;

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
  optional(): Schema<Input | undefined, Output | undefined> {
    return this._withState({ isOptional: true }) as Schema<Input | undefined, Output | undefined>;
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
  nullable(): Schema<Input | null, Output | null> {
    return this._withState({ isNullable: true }) as Schema<Input | null, Output | null>;
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
  refine(predicate: (value: Output) => boolean, options?: SchemaOptions): this {
    const step: RefineStep = {
      kind: 'refine',
      predicate: predicate as (value: unknown) => boolean,
      options,
    };
    return this._withState({ steps: [...this._state.steps, step] });
  }

  /**
   * Converts an accepted value into a different one, changing the schema's
   * `Output` type to whatever the function returns. It runs after validation
   * passes, so the function only ever sees a value this schema accepted —
   * unlike `.coerce()`, which runs before.
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
  transform<NewOutput>(fn: (value: Output) => NewOutput): Schema<Input, NewOutput> {
    const step: TransformStep = {
      kind: 'transform',
      fn: fn as (value: unknown) => unknown,
    };
    return this._withState({
      steps: [...this._state.steps, step],
    }) as unknown as Schema<Input, NewOutput>;
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
  coerce(): Schema<unknown, Output> {
    return this._withState({ shouldCoerce: true }) as Schema<unknown, Output>;
  }

  /**
   * Generic, prototype-preserving clone used by every modifier above, so a
   * new concrete schema class never has to implement its own clone/modifier
   * plumbing beyond `_checkType` and (optionally) `_coerceInput`. `_state` is
   * the single grouped field every modifier patches, rather than each flag
   * being cloned independently.
   *
   * @internal
   */
  protected _withState(patch: Partial<SchemaState>): this {
    const clone = Object.create(Object.getPrototypeOf(this) as object) as this;
    Object.assign(clone, this, { _state: { ...this._state, ...patch } });
    return clone;
  }
}
