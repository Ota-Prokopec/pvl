import { ISSUE_CODE, Issue, type IssueEditableProps } from '../issue.js';
import { MODIFIER_TAG } from '../modifiers.js';
import type { RetypedSchema } from '../types.js';
import { Schema } from './schema.js';

/**
 * The base class every schema in this library extends: a {@link Schema}
 * modifiers can be chained onto. You never construct one directly —
 * `pvl.string()`, `pvl.object()` and the rest hand you a subclass — and every
 * modifier hands back that same subclass, so its own methods stay chainable
 * whatever order you chain them in. `.transform()` is the exception: it ends
 * the chain with a plain {@link Schema}.
 *
 * Modifiers run in the order you chain them, so the order can matter:
 * `pvl.string().coerce().optional()` turns `undefined` into `'undefined'`,
 * while `pvl.string().optional().coerce()` accepts it as `undefined`.
 *
 * @example
 * ```ts
 * import { pvl, type ChainableSchema } from '@pvl/schema';
 *
 * // Still a `StringSchema`, so `.min()` is still there.
 * const nickname = pvl.string().optional().min(2);
 * const asBase: ChainableSchema<string | undefined, string | undefined> = nickname;
 *
 * const result = asBase.refine((value) => value !== 'admin').validate(undefined);
 * result.issues; // undefined — an absent value is accepted
 * ```
 */
// Only the Shared Modifiers live here; the pipeline they feed and the
// `_with*Modifier` helpers they build on are `Schema`'s (ADR-0020).
export abstract class ChainableSchema<Input = unknown, Output = Input> extends Schema<
  Input,
  Output
> {
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
  optional(): RetypedSchema<this, Input | undefined, Output | undefined> {
    return this._withPreModifier<Input, Output | undefined>({
      tags: [MODIFIER_TAG.SHORT_CIRCUIT],
      fn: (value) => {
        return value === undefined ? { value: undefined } : null;
      },
    }) as unknown as RetypedSchema<this, Input | undefined, Output | undefined>;
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
  nullable(): RetypedSchema<this, Input | null, Output | null> {
    return this._withPreModifier<Input, Output | null>({
      tags: [MODIFIER_TAG.SHORT_CIRCUIT],
      fn: (value) => {
        return value === null ? { value: null } : null;
      },
    }) as unknown as RetypedSchema<this, Input | null, Output | null>;
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
   * `object` or `array` schema is still one, with its `shape` or `element`.
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
   * // Still an object schema, so `shape` is still there.
   * const range = pvl
   *   .object({ min: pvl.number(), max: pvl.number() })
   *   .refine((value) => value.min <= value.max);
   * range.shape.min.validate(1); // { value: 1 }
   * ```
   */
  // `Output` is wider than the predicate ever sees after `.nullable()` or
  // `.optional()`, since a short-circuited value skips it, which is harmless.
  refine(
    predicate: (value: Output) => boolean,
    issueProps?: IssueEditableProps,
  ): RetypedSchema<this, Input, Output> {
    return this._withPostModifier<Output, Output>({
      fn: (value, path) => {
        return predicate(value)
          ? null
          : { issues: [new Issue(ISSUE_CODE.CUSTOM, path, issueProps?.message)] };
      },
    }) as unknown as RetypedSchema<this, Input, Output>;
  }

  /**
   * Converts an accepted value into a different one, changing the `Output`
   * type to whatever the function returns. It is the last thing to run, and
   * only once nothing has failed, so the function only ever sees a value
   * this schema accepted — unlike `.coerce()`, which runs before the type
   * check. A value `.optional()` or `.nullable()` accepted still reaches it,
   * so the function is typed to receive `undefined` or `null` too.
   *
   * It ends the chain: the result is a plain {@link Schema}, which can
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
  transform<NewOutput>(fn: (value: Output) => NewOutput): Schema<Input, NewOutput> {
    return this._withPostModifier<Output, NewOutput>({
      tags: [MODIFIER_TAG.REQUIRES_ALL_PASSED, MODIFIER_TAG.RUNS_AFTER_SHORT_CIRCUIT],
      fn: (value) => {
        return { value: fn(value) };
      },
    }) as unknown as Schema<Input, NewOutput>;
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
  coerce(): RetypedSchema<this, unknown, Output> {
    return this._withPreModifier<unknown, unknown>({
      fn: (value) => {
        return { value: this._coerceInput(value) };
      },
    }) as unknown as RetypedSchema<this, unknown, Output>;
  }
}
