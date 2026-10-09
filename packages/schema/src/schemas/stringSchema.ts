import { coerceToString } from '../coercions.js';
import { ISSUE_CODE } from '../enums.js';
import { Issue, type IssueEditableProps } from '../issue.js';
import type { Result } from '../result.js';
import type { SchemaKind } from '../types.js';
import { ChainableSchema } from './chainableSchema.js';

/**
 * The default message of every Issue `StringSchema` reports, keyed by the method
 * that reports it. `@pvl/schema-compiler` calls the same functions to write
 * each message into a Compiled Schema as a literal.
 *
 * @internal
 */
export const STRING_SCHEMA_ISSUE_MESSAGE = {
  _checkType: (): string => 'Expected string',
  min: (minLength: number): string => `String must contain at least ${minLength} character(s)`,
  max: (maxLength: number): string => `String must contain at most ${maxLength} character(s)`,
  length: (exactLength: number): string =>
    `String must contain exactly ${exactLength} character(s)`,
} as const;

interface StringSchemaKind extends SchemaKind<StringSchema<unknown, unknown>> {
  readonly type: StringSchema<this['Input'], this['Output']>;
}

/**
 * Accepts a JavaScript `string`, with optional length constraints. Build one
 * with `pvl.string()`.
 *
 * Constraints are checked in the order they were chained, once the value is a
 * string, and every one that fails is reported — not just the first.
 *
 * Constraints and the shared modifiers chain in any order — a constraint
 * keeps whatever modifiers were already applied.
 *
 * @example
 * ```ts
 * import { pvl } from '@pvl/schema';
 *
 * const username = pvl.string().min(3).max(20);
 *
 * username.validate('ada'); // { value: 'ada' }
 * username.validate('ad'); // { issues: [{ code: 'TOO_SMALL', ... }] }
 * username.validate(42); // { issues: [{ code: 'INVALID_TYPE', ... }] }
 * ```
 */
export class StringSchema<Input = string, Output = string> extends ChainableSchema<Input, Output> {
  /** @internal */
  declare readonly '~kind': StringSchemaKind;

  /** @internal */
  constructor() {
    super();
  }

  /**
   * Requires at least `minLength` characters. The comparison is on
   * `String.prototype.length`, i.e. UTF-16 code units.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const password = pvl.string().min(8, { message: 'too short' });
   *
   * password.validate('hunter2'); // { issues: [{ code: 'TOO_SMALL', message: 'too short' }] }
   * ```
   */
  min(minLength: number, options?: IssueEditableProps): this {
    return this._withPostModifier<string, string>({
      fn: (value, path) => {
        return value.length >= minLength
          ? null
          : {
              issues: [
                new Issue(
                  ISSUE_CODE.TOO_SMALL,
                  path,
                  options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.min(minLength),
                ),
              ],
            };
      },
    });
  }

  /**
   * Requires at most `maxLength` characters.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const tweet = pvl.string().max(280);
   *
   * tweet.validate('x'.repeat(281)); // { issues: [{ code: 'TOO_BIG', ... }] }
   * ```
   */
  max(maxLength: number, options?: IssueEditableProps): this {
    return this._withPostModifier<string, string>({
      fn: (value, path) => {
        return value.length <= maxLength
          ? null
          : {
              issues: [
                new Issue(
                  ISSUE_CODE.TOO_BIG,
                  path,
                  options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.max(maxLength),
                ),
              ],
            };
      },
    });
  }

  /**
   * Requires exactly `exactLength` characters.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const countryCode = pvl.string().length(2);
   *
   * countryCode.validate('CZ'); // { value: 'CZ' }
   * countryCode.validate('CZE'); // { issues: [{ code: 'INVALID_LENGTH', ... }] }
   * ```
   */
  length(exactLength: number, options?: IssueEditableProps): this {
    return this._withPostModifier<string, string>({
      fn: (value, path) => {
        return value.length === exactLength
          ? null
          : {
              issues: [
                new Issue(
                  ISSUE_CODE.INVALID_LENGTH,
                  path,
                  options?.message ?? STRING_SCHEMA_ISSUE_MESSAGE.length(exactLength),
                ),
              ],
            };
      },
    });
  }

  /** @internal */
  override _coerceInput(value: unknown): unknown {
    return coerceToString(value);
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<string> {
    if (typeof value !== 'string') {
      return {
        issues: [
          new Issue(ISSUE_CODE.INVALID_TYPE, path, STRING_SCHEMA_ISSUE_MESSAGE._checkType()),
        ],
      };
    }
    return { value };
  }
}
