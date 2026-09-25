import { coerceToNumber } from '../coercions.js';
import { buildIssue, ISSUE_CODE, type IssueCode } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

type NumberCheck = {
  readonly code: IssueCode;
  readonly message: string;
  readonly test: (value: number) => boolean;
};

/**
 * Accepts a JavaScript `number` — floats and integers alike, since JavaScript
 * has only one numeric type. Build one with `pvl.number()`.
 *
 * `NaN` is rejected even though `typeof NaN === 'number'`: an accepted `NaN`
 * would silently fail every `.min()`/`.max()` comparison instead of producing
 * a clear `Issue`. `Infinity` and `-Infinity` are accepted — there is no
 * built-in finiteness constraint. Arbitrary-precision integers belong to
 * `pvl.bigint()`, and this schema never accepts or produces one.
 *
 * Chain these constraints **before** the shared modifiers (`.optional()`,
 * `.nullable()`, `.coerce()`, `.refine()`, `.transform()`): a constraint
 * method rebuilds the schema from its constraints alone, so a modifier
 * applied earlier in the chain is silently dropped. This is a defect, not a
 * design — prefer `.min(3).optional()` over `.optional().min(3)` until it is
 * fixed.
 *
 * @example
 * ```ts
 * import { pvl } from '@pvl/schema';
 *
 * const age = pvl.number().int().min(0).max(130);
 *
 * age.validate(36); // { value: 36 }
 * age.validate(36.5); // { issues: [{ code: 'NOT_INTEGER', ... }] }
 * age.validate(Number.NaN); // { issues: [{ code: 'INVALID_TYPE', ... }] }
 * ```
 */
export class NumberSchema extends Schema<number, number> {
  private readonly _typeMessage: string;
  private readonly _checks: ReadonlyArray<NumberCheck>;

  /** @internal */
  constructor(options?: SchemaOptions, checks: ReadonlyArray<NumberCheck> = []) {
    super();
    this._typeMessage = options?.message ?? 'Expected number';
    this._checks = checks;
  }

  /**
   * Requires a value greater than or equal to `value` — the bound is
   * inclusive.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const quantity = pvl.number().min(1, { message: 'order at least one' });
   *
   * quantity.validate(1); // { value: 1 }
   * quantity.validate(0); // { issues: [{ code: 'TOO_SMALL', message: 'order at least one' }] }
   * ```
   */
  min(value: number, options?: SchemaOptions): NumberSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_SMALL,
      message: options?.message ?? `Number must be greater than or equal to ${value}`,
      test: (current) => current >= value,
    });
  }

  /**
   * Requires a value less than or equal to `value` — the bound is inclusive.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const percentage = pvl.number().min(0).max(100);
   *
   * percentage.validate(101); // { issues: [{ code: 'TOO_BIG', ... }] }
   * ```
   */
  max(value: number, options?: SchemaOptions): NumberSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_BIG,
      message: options?.message ?? `Number must be less than or equal to ${value}`,
      test: (current) => current <= value,
    });
  }

  /**
   * Requires a whole number, as judged by `Number.isInteger`. `Infinity`
   * fails it.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const pageSize = pvl.number().int();
   *
   * pageSize.validate(25); // { value: 25 }
   * pageSize.validate(25.5); // { issues: [{ code: 'NOT_INTEGER', ... }] }
   * ```
   */
  int(options?: SchemaOptions): NumberSchema {
    return this._withCheck({
      code: ISSUE_CODE.NOT_INTEGER,
      message: options?.message ?? 'Number must be an integer',
      test: (current) => Number.isInteger(current),
    });
  }

  /** @internal */
  override _coerceInput(value: unknown): unknown {
    return coerceToNumber(value);
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<number> {
    if (typeof value !== 'number' || Number.isNaN(value)) {
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

  private _withCheck(check: NumberCheck): NumberSchema {
    return new NumberSchema({ message: this._typeMessage }, [...this._checks, check]);
  }
}
