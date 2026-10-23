import type { StandardSchemaV1 } from '@standard-schema/spec';
import { VENDOR, type SCHEMA_BRAND } from '../consts.js';
import type { Issue } from '../issue.js';
import type { Result } from '../result.js';
import type { StandardSchemaProps } from '../standardSchema.js';
import { MODIFIER_TAG } from '../modifiers/enums.js';
import type { Modifier, ModifierShape } from '../modifiers/modifiers.js';
import type { PreModifiersResult } from '../types.js';
import type { Schema, StandaloneMarker } from './schema.js';

// Whether `modifier` was built by one of the modifier factories in
// `shapes`. Matched by the factory rather than the instance, so a caller
// can remove a modifier without holding on to the one it added: `.strict()`
// and `.passthrough()` drop whichever unknown-keys modifier is already set.
//
//   isBuiltByOneOf(unknownKeysStrictModifier(keys), UNKNOWN_KEYS_MODIFIERS) // true
//   isBuiltByOneOf(unknownKeysStripModifier(keys), UNKNOWN_KEYS_MODIFIERS)  // true
//   isBuiltByOneOf(<the modifier .min(3) adds>, UNKNOWN_KEYS_MODIFIERS)     // false
//
// A modifier with no `shape` matches nothing, so it is never removed.
const isBuiltByOneOf = (
  modifier: Modifier<unknown, unknown>,
  shapes: ReadonlyArray<ModifierShape>,
): boolean => {
  return modifier.shape !== undefined && shapes.includes(modifier.shape);
};

/**
 * The class every schema a `pvl.*` factory builds extends: a {@link Schema}
 * that validates by running its modifiers around its type check, in the
 * order they were chained. A compiled schema validates the same values
 * without it, so a field, `.transform()` and `pvl.compile()` take and hand
 * back a {@link Schema} instead.
 *
 * @example
 * ```ts
 * import { pvl, type InterpretedSchema, type Schema } from '@pvl/schema';
 *
 * const name: InterpretedSchema<string> = pvl.string().min(2);
 * const field: Schema<string> = name;
 *
 * field.validate('A'); // { issues: [...] } — TOO_SMALL
 * ```
 */
// Everything a schema needs to validate, and the internal plumbing a
// Modifier is built with; the Shared Modifiers themselves are on
// `ChainableInterpretedSchema`. A Compiled Schema implements `Schema` on its
// own rather than extending this class (ADR-0029).
export abstract class InterpretedSchema<Input = unknown, Output = Input> implements Schema<
  Input,
  Output
> {
  /** @internal */
  declare readonly [SCHEMA_BRAND]: true;

  /** @internal */
  readonly _standalone: boolean = false;

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
   * Marks this schema as a Standalone Key: as a field of `pvl.object()`, it
   * is kept in that object's `shape`, so it can be validated on its own, and
   * once the object is compiled, `@pvl/schema-compiler` gives it a compiled
   * validator of its own. Validation is unchanged.
   *
   * The schema comes back as the same type it went in as, marked, so the
   * chain goes on: modifiers can follow it, and an object keeps its `shape`
   * and an array its `element`. It is valid on any schema, a field or not,
   * and calling it again changes nothing.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const user = pvl.object({
   *   email: pvl.string().standalone().min(3),
   *   age: pvl.number().int(),
   * });
   *
   * user.shape.email.validate('a@b.c'); // { value: 'a@b.c' }
   * // user.shape.age — a compile error: `age` isn't a Standalone Key
   * ```
   */
  // A clone carrying the flag, which every later clone copies, as the
  // marker every later return type carries (ADR-0036).
  standalone(): this & StandaloneMarker {
    return Object.assign(this._clone(), { _standalone: true }) as unknown as this &
      StandaloneMarker;
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
  //TODO: Rename `_checkType` to `_baseCheck`

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
    clone._preModifiers = this._preModifiers.filter(
      (modifier) => !isBuiltByOneOf(modifier, shapes),
    );
    clone._postModifiers = this._postModifiers.filter(
      (modifier) => !isBuiltByOneOf(modifier, shapes),
    );
    return clone;
  }
}
