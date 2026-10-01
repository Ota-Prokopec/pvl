import { coerceToBigint } from '../coercions.js';
import { ISSUE_CODE, Issue, type IssueEditableProps } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaKind } from './schema.js';

interface BigintSchemaKind extends SchemaKind {
  readonly type: BigintSchema<this['Input'], this['Output']>;
}

/**
 * Accepts a real JavaScript `bigint` and nothing else — a `number` is never
 * silently accepted, so this schema never overlaps with `pvl.number()`. Build
 * one with `pvl.bigint()`.
 *
 * Bounds are compared with real `bigint` operators against real `bigint`
 * arguments; mixing in a `number` bound is a type error. There is no
 * `.int()`, because a `bigint` has no fractional form for it to reject. The
 * output is always a `bigint`, never downgraded to a `number` — the precision
 * loss that would cause is exactly what `bigint` exists to avoid.
 *
 * Constraints and the shared modifiers chain in either order — a constraint
 * keeps whatever modifiers were already applied.
 *
 * @example
 * ```ts
 * import { pvl } from '@pvl/schema';
 *
 * const fileSize = pvl.bigint().min(0n);
 *
 * fileSize.validate(9007199254740993n); // { value: 9007199254740993n }
 * fileSize.validate(42); // { issues: [{ code: 'INVALID_TYPE', ... }] }
 *
 * // `.coerce()` accepts strings and whole numbers:
 * pvl.bigint().coerce().validate('42'); // { value: 42n }
 * ```
 */
export class BigintSchema<Input = bigint, Output = bigint> extends Schema<Input, Output> {
  declare readonly '~kind': BigintSchemaKind;
  private readonly _typeMessage: string;

  /** @internal */
  constructor(options?: IssueEditableProps) {
    super();
    this._typeMessage = options?.message ?? 'Expected bigint';
  }

  /**
   * Requires a value greater than or equal to `minValue` — inclusive, and
   * itself a `bigint`.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const positive = pvl.bigint().min(1n);
   *
   * positive.validate(0n); // { issues: [{ code: 'TOO_SMALL', ... }] }
   * ```
   */
  min(minValue: bigint, options?: IssueEditableProps): this {
    return this._withPostModifier<bigint, bigint>({
      fn: (value, path) => {
        return value >= minValue
          ? null
          : {
              issues: [
                new Issue(
                  ISSUE_CODE.TOO_SMALL,
                  path,
                  options?.message ?? `Bigint must be greater than or equal to ${minValue}`,
                ),
              ],
            };
      },
    });
  }

  /**
   * Requires a value less than or equal to `maxValue` — inclusive, and itself
   * a `bigint`.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const int64 = pvl.bigint().max(9223372036854775807n);
   *
   * int64.validate(9223372036854775808n); // { issues: [{ code: 'TOO_BIG', ... }] }
   * ```
   */
  max(maxValue: bigint, options?: IssueEditableProps): this {
    return this._withPostModifier<bigint, bigint>({
      fn: (value, path) => {
        return value <= maxValue
          ? null
          : {
              issues: [
                new Issue(
                  ISSUE_CODE.TOO_BIG,
                  path,
                  options?.message ?? `Bigint must be less than or equal to ${maxValue}`,
                ),
              ],
            };
      },
    });
  }

  /** @internal */
  override _coerceInput(value: unknown): unknown {
    return coerceToBigint(value);
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<bigint> {
    if (typeof value !== 'bigint') {
      return {
        issues: [new Issue(ISSUE_CODE.INVALID_TYPE, path, this._typeMessage)],
      };
    }
    return { value };
  }
}
