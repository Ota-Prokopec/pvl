import type { StandardSchemaV1 } from '@standard-schema/spec';
import { VENDOR } from '../consts.js';
import type { Issue } from '../issue.js';
import type { Result } from '../result.js';
import type { StandardSchemaProps } from '../standardSchema.js';
import { MODIFIER_TAG, type Modifier, type ModifierShape } from '../modifiers.js';
import type { PreModifiersResult } from '../types.js';

// Whether `modifier` stays when every modifier built by one of `shapes` is
// removed. Matched by shape rather than identity, so a caller can remove a
// modifier without holding on to the instance it added.
const survives = (
  modifier: Modifier<unknown, unknown>,
  shapes: ReadonlyArray<ModifierShape>,
): boolean => {
  return modifier.shape === undefined || !shapes.includes(modifier.shape);
};

/**
 * What every schema in this library is: something that validates a value.
 * A field of an object schema, an element of an array schema and a member
 * of a union are each typed as one, so any schema fits there. It is also
 * what `.transform()` and `pvl.compile()` hand back, since no modifier can be
 * chained onto either: chain constraints, `.optional()` and `.refine()`
 * first.
 *
 * `Input` is what a value must look like going in; `Output` is what a
 * successful `.validate()` hands back, which differs from `Input` once a
 * `.transform()` is attached.
 *
 * @example
 * ```ts
 * import { pvl, type Schema } from '@pvl/schema';
 *
 * const length: Schema<string, number> = pvl.string().transform((value) => value.length);
 *
 * length.validate('abc'); // { value: 3 }
 * pvl.object({ name: length }).validate({ name: 'Ada' }); // { value: { name: 3 } }
 * ```
 */
// Everything a schema needs to validate, and the internal plumbing a
// Modifier is built with; the Shared Modifiers themselves are on
// `ChainableSchema`. A Compiled Schema extends this class directly (ADR-0020).
// Its private and protected members make the class nominal, which is what
// keeps a Standard Schema from another library from being a field (ADR-0018).
export abstract class Schema<Input = unknown, Output = Input> {
  // Each runs in chain order, the pre-modifiers before `_checkType` and the
  // post-modifiers after it — see `_validate` and ADR-0010.
  private _preModifiers: ReadonlyArray<Modifier<unknown, unknown>>;
  private _postModifiers: ReadonlyArray<Modifier<unknown, unknown>>;

  // A schema type whose default behaviour is itself a Modifier (`object`'s
  // stripping, a post-modifier) starts with it, so a later Modifier removes it
  // by shape like any other.
  /** @internal */
  constructor({
    preModifiers = [],
    postModifiers = [],
  }: {
    readonly preModifiers?: ReadonlyArray<Modifier<unknown, unknown>>;
    readonly postModifiers?: ReadonlyArray<Modifier<unknown, unknown>>;
  } = {}) {
    this._preModifiers = preModifiers;
    this._postModifiers = postModifiers;
  }

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
    const preModifiersResult: PreModifiersResult = this._runPreModifiers(value, path);
    // `_checkType`'s output, or the accepted value after a short-circuit.
    let checkTypeValue = preModifiersResult.value;

    if (!preModifiersResult.shortCircuited) {
      const checked = this._checkType(checkTypeValue, path);
      // A failed type check leaves nothing for a post-modifier to check.
      if (checked.issues) {
        return { issues: [...preModifiersResult.issues, ...checked.issues] };
      }
      checkTypeValue = checked.value;
    }

    // `Output` is a free type parameter the modifiers' own types can't be
    // followed back to.
    return this._runPostModifiers(
      { ...preModifiersResult, value: checkTypeValue },
      path,
    ) as Result<Output>;
  }

  // ADR-0010 step 2: every pre-modifier in chain order, until a
  // `SHORT_CIRCUIT` step accepts the value.
  private _runPreModifiers(value: unknown, path: ReadonlyArray<PropertyKey>): PreModifiersResult {
    const issues: Issue[] = [];
    let current = value;

    for (const modifier of this._preModifiers) {
      const result = modifier.fn(current, path);
      if (result === null) {
        continue;
      }
      if (result.issues) {
        issues.push(...result.issues);
        continue;
      }
      current = result.value;
      if (modifier.tags?.includes(MODIFIER_TAG.SHORT_CIRCUIT)) {
        return { value: current, issues, shortCircuited: true };
      }
    }

    return { value: current, issues, shortCircuited: false };
  }

  // ADR-0010 steps 4–6: every post-modifier in chain order, collecting every
  // Issue — after a short-circuit, only the `RUNS_AFTER_SHORT_CIRCUIT` ones.
  private _runPostModifiers(
    state: PreModifiersResult,
    path: ReadonlyArray<PropertyKey>,
  ): Result<unknown> {
    const issues = [...state.issues];
    let current = state.value;

    for (const modifier of this._postModifiers) {
      if (state.shortCircuited && !modifier.tags?.includes(MODIFIER_TAG.RUNS_AFTER_SHORT_CIRCUIT)) {
        continue;
      }
      if (issues.length > 0 && modifier.tags?.includes(MODIFIER_TAG.REQUIRES_ALL_PASSED)) {
        continue;
      }
      const result = modifier.fn(current, path);
      if (result === null) {
        continue;
      }
      if (result.issues) {
        issues.push(...result.issues);
        continue;
      }
      current = result.value;
    }

    return issues.length > 0 ? { issues } : { value: current };
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

  /**
   * A copy of this schema without any modifier built by one of `shapes`.
   *
   * @internal
   */
  protected _withoutModifiers(shapes: ReadonlyArray<ModifierShape>): this {
    const clone = this._clone();
    clone._preModifiers = this._preModifiers.filter((modifier) => survives(modifier, shapes));
    clone._postModifiers = this._postModifiers.filter((modifier) => survives(modifier, shapes));
    return clone;
  }
}
