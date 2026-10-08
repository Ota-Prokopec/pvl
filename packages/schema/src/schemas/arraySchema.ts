import { ISSUE_CODE } from '../enums.js';
import { Issue, type IssueEditableProps } from '../issue.js';
import type { Result } from '../result.js';
import type { InferInput, InferOutput, SchemaKind } from '../types.js';
import { ChainableSchema } from './chainableSchema.js';
import type { Schema } from './schema.js';

/**
 * The default message of every Issue `ArraySchema` reports, keyed by the method
 * that reports it. `@pvl/schema-compiler` calls the same functions to write
 * each message into a Compiled Schema as a literal.
 *
 * @internal
 */
export const ARRAY_SCHEMA_ISSUE_MESSAGE = {
  _checkType: (): string => 'Expected array',
  min: (minLength: number): string => `Array must contain at least ${minLength} element(s)`,
  max: (maxLength: number): string => `Array must contain at most ${maxLength} element(s)`,
  length: (exactLength: number): string => `Array must contain exactly ${exactLength} element(s)`,
} as const;

interface ArraySchemaKind<ItemSchema extends Schema<unknown, unknown>> extends SchemaKind<
  ArraySchema<ItemSchema, unknown, unknown>
> {
  readonly type: ArraySchema<ItemSchema, this['Input'], this['Output']>;
}

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
 * The length constraints are checks on the array itself. They run, in the
 * order chained, only once every element has passed, so they never report
 * alongside element issues; between themselves they all report rather than
 * stopping at the first. `.coerce()` is inherited but does nothing here —
 * there is no unambiguous way to read an array out of a non-array.
 *
 * Every modifier hands back an array schema rather than the base `ChainableSchema`,
 * so a modified array schema is still something `pvl.compile()` accepts and
 * the length constraints stay chainable. `.transform()` ends the chain.
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
  ItemSchema extends Schema<unknown, unknown>,
  Input = InferInput<ItemSchema>[],
  Output = InferOutput<ItemSchema>[],
> extends ChainableSchema<Input, Output> {
  /** @internal */
  declare readonly '~kind': ArraySchemaKind<ItemSchema>;
  private readonly itemSchema: ItemSchema;

  /** @internal */
  constructor(itemSchema: ItemSchema) {
    super();
    this.itemSchema = itemSchema;
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
  get element(): ItemSchema {
    return this.itemSchema;
  }

  /**
   * Requires at least `minLength` elements.
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
  min(minLength: number, options?: IssueEditableProps): this {
    return this._withPostModifier<ReadonlyArray<unknown>, ReadonlyArray<unknown>>({
      fn: (value, path) => {
        return value.length >= minLength
          ? null
          : {
              issues: [
                new Issue(
                  ISSUE_CODE.TOO_SMALL,
                  path,
                  options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.min(minLength),
                ),
              ],
            };
      },
    });
  }

  /**
   * Requires at most `maxLength` elements.
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
  max(maxLength: number, options?: IssueEditableProps): this {
    return this._withPostModifier<ReadonlyArray<unknown>, ReadonlyArray<unknown>>({
      fn: (value, path) => {
        return value.length <= maxLength
          ? null
          : {
              issues: [
                new Issue(
                  ISSUE_CODE.TOO_BIG,
                  path,
                  options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.max(maxLength),
                ),
              ],
            };
      },
    });
  }

  /**
   * Requires exactly `exactLength` elements.
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
  length(exactLength: number, options?: IssueEditableProps): this {
    return this._withPostModifier<ReadonlyArray<unknown>, ReadonlyArray<unknown>>({
      fn: (value, path) => {
        return value.length === exactLength
          ? null
          : {
              issues: [
                new Issue(
                  ISSUE_CODE.INVALID_LENGTH,
                  path,
                  options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.length(exactLength),
                ),
              ],
            };
      },
    });
  }

  /** @internal */
  _checkType(array: unknown, path: ReadonlyArray<PropertyKey>): Result<Output> {
    if (!Array.isArray(array)) {
      return {
        issues: [new Issue(ISSUE_CODE.INVALID_TYPE, path, ARRAY_SCHEMA_ISSUE_MESSAGE._checkType())],
      };
    }

    const output: unknown[] = [];
    const issues: Issue[] = [];

    for (const [index, item] of (array as unknown[]).entries()) {
      const result = this.itemSchema._validate(item, [...path, index]);
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
}
