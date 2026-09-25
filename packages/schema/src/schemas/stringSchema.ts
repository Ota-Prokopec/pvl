import { coerceToString } from '../coercions.js';
import { buildIssue, ISSUE_CODE, type IssueCode } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

type StringCheck = {
  readonly code: IssueCode;
  readonly message: string;
  readonly test: (value: string) => boolean;
};

/**
 * Accepts a JavaScript `string`, with optional length constraints. Build one
 * with `pvl.string()`.
 *
 * Constraints are checked in the order they were chained, and checking stops
 * at the first one that fails, so a single `Issue` comes back rather than
 * one per constraint.
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
export class StringSchema extends Schema<string, string> {
  private readonly _typeMessage: string;
  private readonly _checks: ReadonlyArray<StringCheck>;

  /** @internal */
  constructor(options?: SchemaOptions, checks: ReadonlyArray<StringCheck> = []) {
    super();
    this._typeMessage = options?.message ?? 'Expected string';
    this._checks = checks;
  }

  /**
   * Requires at least `length` characters. The comparison is on
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
  min(length: number, options?: SchemaOptions): StringSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_SMALL,
      message: options?.message ?? `String must contain at least ${length} character(s)`,
      test: (value) => value.length >= length,
    });
  }

  /**
   * Requires at most `length` characters.
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
  max(length: number, options?: SchemaOptions): StringSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_BIG,
      message: options?.message ?? `String must contain at most ${length} character(s)`,
      test: (value) => value.length <= length,
    });
  }

  /**
   * Requires exactly `length` characters.
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
  length(length: number, options?: SchemaOptions): StringSchema {
    return this._withCheck({
      code: ISSUE_CODE.INVALID_LENGTH,
      message: options?.message ?? `String must contain exactly ${length} character(s)`,
      test: (value) => value.length === length,
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
        issues: [buildIssue(ISSUE_CODE.INVALID_TYPE, this._typeMessage, path)],
      };
    }
    for (const check of this._checks) {
      if (!check.test(value)) {
        return { issues: [buildIssue(check.code, check.message, path)] };
      }
    }
    return { value };
  }

  private _withCheck(check: StringCheck): StringSchema {
    return new StringSchema({ message: this._typeMessage }, [...this._checks, check]);
  }
}
