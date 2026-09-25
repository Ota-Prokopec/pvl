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
export class ArraySchema<Item extends ArrayItem> extends Schema<
  ArrayInput<Item>,
  ArrayOutput<Item>
> {
  private readonly _item: Item;
  private readonly _typeMessage: string;
  private readonly _checks: ReadonlyArray<ArrayCheck>;

  /** @internal */
  constructor(item: Item, options?: SchemaOptions, checks: ReadonlyArray<ArrayCheck> = []) {
    super();
    this._item = item;
    this._typeMessage = options?.message ?? 'Expected array';
    this._checks = checks;
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
  min(length: number, options?: SchemaOptions): ArraySchema<Item> {
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
  max(length: number, options?: SchemaOptions): ArraySchema<Item> {
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
  length(length: number, options?: SchemaOptions): ArraySchema<Item> {
    return this._withCheck({
      code: ISSUE_CODE.INVALID_LENGTH,
      message: options?.message ?? `Array must contain exactly ${length} element(s)`,
      test: (value) => value.length === length,
    });
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<ArrayOutput<Item>> {
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
    // system can't follow back to the composed array type.
    return { value: output as ArrayOutput<Item> };
  }

  private _withCheck(check: ArrayCheck): ArraySchema<Item> {
    return new ArraySchema(this._item, { message: this._typeMessage }, [...this._checks, check]);
  }
}
