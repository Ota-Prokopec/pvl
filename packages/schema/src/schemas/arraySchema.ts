import type { StandardSchemaV1 } from '@standard-schema/spec';
import { buildIssue, ISSUE_CODE, type Issue, type IssueCode } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

type ArrayCheck = {
  readonly code: IssueCode;
  readonly message: string;
  readonly test: (value: ReadonlyArray<unknown>) => boolean;
};

/**
 * The element schema an array schema validates every item against. Any schema
 * qualifies, including another array schema or an object schema.
 *
 * @example
 * ```ts
 * import { pvl, type ArrayItem } from '@pvl/schema';
 *
 * const item: ArrayItem = pvl.string();
 * const tags = pvl.array(item);
 * ```
 */
export type ArrayItem = Schema<unknown, unknown>;

/**
 * The array type a value must match going in, composed from the item
 * schema's own input type.
 *
 * @example
 * ```ts
 * import { pvl, type ArrayInput } from '@pvl/schema';
 *
 * const item = pvl.string();
 * const input: ArrayInput<typeof item> = ['a', 'b'];
 *
 * pvl.array(item).validate(input);
 * ```
 */
export type ArrayInput<Item extends ArrayItem> = StandardSchemaV1.InferInput<Item>[];

/**
 * The array type a successful validation hands back, composed from the item
 * schema's own output type — which differs from the input type once the item
 * schema carries a `.transform()`.
 *
 * @example
 * ```ts
 * import { pvl, type ArrayOutput } from '@pvl/schema';
 *
 * const item = pvl.string().transform((value) => value.length);
 * const output: ArrayOutput<typeof item> = [1, 2]; // numbers, not strings
 *
 * pvl.array(item).validate(['a', 'bc']); // { value: [1, 2] }
 * ```
 */
export type ArrayOutput<Item extends ArrayItem> = StandardSchemaV1.InferOutput<Item>[];

/**
 * Validates every element against one shared item schema. Build one with
 * `pvl.array(item)`.
 *
 * Elements are independent: every element is checked even after an earlier
 * one fails, so a single `Result` carries one `Issue` per failing element,
 * each pathed with its numeric index. Nest arrays and objects freely — each
 * level appends its own path segment, so a failure deep inside reports
 * exactly where it happened.
 *
 * The length constraints are checks on the array itself and, like a
 * primitive's checks, stop at the first failure rather than collecting
 * alongside element issues. `.coerce()` is inherited but does nothing here —
 * there is no unambiguous way to read an array out of a non-array.
 *
 * `.optional()`, `.nullable()`, `.refine()` and `.transform()` hand back an
 * array schema rather than the base `Schema`, so a modified array schema is
 * still something `pvl.compile()` accepts — and the length constraints stay
 * chainable in either order.
 *
 * @example
 * ```ts
 * import { pvl } from '@pvl/schema';
 *
 * const tags = pvl.array(pvl.string()).min(1).max(5);
 *
 * tags.validate(['a', 'b']); // { value: ['a', 'b'] }
 * tags.validate(['a', 2, 3]);
 * // { issues: [{ path: [1], ... }, { path: [2], ... }] } — every failing element
 * ```
 */
export class ArraySchema<
  Item extends ArrayItem,
  Input = ArrayInput<Item>,
  Output = ArrayOutput<Item>,
> extends Schema<Input, Output> {
  private readonly _item: Item;
  private readonly _typeMessage: string;
  // Not `readonly`: `_withCheck` re-points it on a clone of this instance.
  private _checks: ReadonlyArray<ArrayCheck>;

  /** @internal */
  constructor(item: Item, options?: SchemaOptions) {
    super();
    this._item = item;
    this._typeMessage = options?.message ?? 'Expected array';
    this._checks = [];
  }

  // An accessor with no setter, so the property cannot be written. One schema
  // rather than a keyed collection, so — unlike `ObjectSchema`'s `shape` —
  // there is nothing below it to make read-only. The schema handed back is the
  // very instance the caller declared, so its own modifiers come with it, and
  // `@pvl/schema-compiler`'s Compiled Schemas expose `element` too, so a call
  // site written against an interpreted schema survives the import swap.
  /**
   * The schema every element of this array is validated against, so a single
   * item can be reached and validated on its own without validating a whole
   * array. A composite item carries its own `shape` or `element`, so nested
   * structure is reachable all the way down.
   *
   * Read-only: reading the item schema never affects how this schema
   * validates, and it cannot be replaced.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const users = pvl.array(pvl.object({ name: pvl.string() }));
   *
   * users.element.validate({ name: 'Ada' }); // { value: { name: 'Ada' } }
   * users.element.shape.name.validate(42); // { issues: [{ code: 'INVALID_TYPE', ... }] }
   * ```
   */
  get element(): Item {
    return this._item;
  }

  /**
   * Requires at least `length` elements.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const tags = pvl.array(pvl.string()).min(1, { message: 'pick at least one tag' });
   *
   * tags.validate([]); // { issues: [{ code: 'TOO_SMALL', message: 'pick at least one tag' }] }
   * ```
   */
  min(length: number, options?: SchemaOptions): ArraySchema<Item, Input, Output> {
    return this._withCheck({
      code: ISSUE_CODE.TOO_SMALL,
      message: options?.message ?? `Array must contain at least ${length} element(s)`,
      test: (value) => value.length >= length,
    });
  }

  /**
   * Requires at most `length` elements.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const tags = pvl.array(pvl.string()).max(5);
   *
   * tags.validate(['a', 'b', 'c', 'd', 'e', 'f']); // { issues: [{ code: 'TOO_BIG', ... }] }
   * ```
   */
  max(length: number, options?: SchemaOptions): ArraySchema<Item, Input, Output> {
    return this._withCheck({
      code: ISSUE_CODE.TOO_BIG,
      message: options?.message ?? `Array must contain at most ${length} element(s)`,
      test: (value) => value.length <= length,
    });
  }

  /**
   * Requires exactly `length` elements.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const rgb = pvl.array(pvl.number().int().min(0).max(255)).length(3);
   *
   * rgb.validate([12, 34, 56]); // { value: [12, 34, 56] }
   * rgb.validate([12, 34]); // { issues: [{ code: 'INVALID_LENGTH', ... }] }
   * ```
   */
  length(length: number, options?: SchemaOptions): ArraySchema<Item, Input, Output> {
    return this._withCheck({
      code: ISSUE_CODE.INVALID_LENGTH,
      message: options?.message ?? `Array must contain exactly ${length} element(s)`,
      test: (value) => value.length === length,
    });
  }

  // The three overrides below only re-state a type: the base modifier
  // already hands back this instance's prototype-preserving clone, so the
  // value is an `ArraySchema` — the compiler just cannot follow the clone
  // back to this class, and the base signature widens to `Schema`.
  /**
   * Accepts `undefined` in addition to the array this schema describes,
   * keeping it an array schema — so it can still be handed to
   * `pvl.compile()` and still carries `.min()`/`.max()`/`.length()`.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const tags = pvl.array(pvl.string()).optional();
   *
   * tags.validate(undefined); // { value: undefined }
   * pvl.compile(tags); // still a composite schema
   * ```
   */
  override optional(): ArraySchema<Item, Input | undefined, Output | undefined> {
    return super.optional() as ArraySchema<Item, Input | undefined, Output | undefined>;
  }

  /**
   * Accepts `null` in addition to the array this schema describes, keeping it
   * an array schema.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const tags = pvl.array(pvl.string()).nullable();
   *
   * tags.validate(null); // { value: null }
   * ```
   */
  override nullable(): ArraySchema<Item, Input | null, Output | null> {
    return super.nullable() as ArraySchema<Item, Input | null, Output | null>;
  }

  /**
   * Converts the accepted array into a different value, changing what
   * `.validate()` hands back while leaving this an array schema — the shape
   * it validates going in is unchanged, so `pvl.compile()` still accepts it.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const tagCount = pvl.array(pvl.string()).transform((value) => value.length);
   *
   * tagCount.validate(['a', 'b']); // { value: 2 }
   * ```
   */
  override transform<NewOutput>(
    fn: (value: Output) => NewOutput,
  ): ArraySchema<Item, Input, NewOutput> {
    return super.transform(fn) as ArraySchema<Item, Input, NewOutput>;
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Output> {
    if (!Array.isArray(value)) {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_TYPE, this._typeMessage, path)],
      };
    }
    for (const check of this._checks) {
      if (!check.test(value)) {
        return { issues: [buildIssue(check.code, check.message, path)] };
      }
    }

    const output: unknown[] = [];
    const issues: Issue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const result = this._item._validate(value[index], [...path, index]);
      if (result.issues) {
        issues.push(...result.issues);
        continue;
      }
      output.push(result.value);
    }

    if (issues.length > 0) {
      return { issues };
    }
    // Built element by element from each item's own result, which the type
    // system can't follow back to the composed array type. `Output` is a free
    // type parameter — a modifier may have widened it past the composed type
    // — so the assertion goes through `unknown`.
    return { value: output as unknown as Output };
  }

  // Clones rather than rebuilding, so a Shared Modifier already chained onto
  // this instance survives the added check — see ADR-0006's amendment.
  private _withCheck(check: ArrayCheck): ArraySchema<Item, Input, Output> {
    const clone = this._withModifiers({});
    clone._checks = [...this._checks, check];
    return clone;
  }
}
