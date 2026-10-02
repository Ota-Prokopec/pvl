import { coerceToNumber } from '../coercions.js';
import { ISSUE_CODE, Issue, type IssueEditableProps } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaKind } from './schema.js';

interface NumberSchemaKind extends SchemaKind {
  readonly type: NumberSchema<this['Input'], this['Output']>;
}

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
 * Constraints are checked in the order they were chained, and every one that
 * fails is reported. They chain in any order with the shared modifiers — a
 * constraint keeps whatever modifiers were already applied.
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
export class NumberSchema<Input = number, Output = number> extends Schema<Input, Output> {
  declare readonly '~kind': NumberSchemaKind;

  /** @internal */
  constructor() {
    super();
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
  min(minValue: number, options?: IssueEditableProps): this {
    return this._withPostModifier<number, number>({
      fn: (value, path) => {
        return value >= minValue
          ? null
          : {
              issues: [
                new Issue(
                  ISSUE_CODE.TOO_SMALL,
                  path,
                  options?.message ?? `Number must be greater than or equal to ${minValue}`,
                ),
              ],
            };
      },
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
  max(maxValue: number, options?: IssueEditableProps): this {
    return this._withPostModifier<number, number>({
      fn: (value, path) => {
        return value <= maxValue
          ? null
          : {
              issues: [
                new Issue(
                  ISSUE_CODE.TOO_BIG,
                  path,
                  options?.message ?? `Number must be less than or equal to ${maxValue}`,
                ),
              ],
            };
      },
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
  int(options?: IssueEditableProps): this {
    return this._withPostModifier<number, number>({
      fn: (value, path) => {
        return Number.isInteger(value)
          ? null
          : {
              issues: [
                new Issue(
                  ISSUE_CODE.NOT_INTEGER,
                  path,
                  options?.message ?? 'Number must be an integer',
                ),
              ],
            };
      },
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
        issues: [new Issue(ISSUE_CODE.INVALID_TYPE, path, 'Expected number')],
      };
    }
    return { value };
  }
}
