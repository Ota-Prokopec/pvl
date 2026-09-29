import { coerceToBigint } from '../coercions.js';
import { buildIssue, ISSUE_CODE, type IssueCode } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

type BigintCheck = {
  readonly code: IssueCode;
  readonly message: string;
  readonly test: (value: bigint) => boolean;
};

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
export class BigintSchema extends Schema<bigint, bigint> {
  private readonly _typeMessage: string;
  // Not `readonly`: `_withCheck` re-points it on a clone of this instance.
  private _checks: ReadonlyArray<BigintCheck>;

  /** @internal */
  constructor(options?: SchemaOptions) {
    super();
    this._typeMessage = options?.message ?? 'Expected bigint';
    this._checks = [];
  }

  /**
   * Requires a value greater than or equal to `bound` — inclusive, and itself
   * a `bigint`.
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
  min(bound: bigint, options?: SchemaOptions): BigintSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_SMALL,
      message: options?.message ?? `Bigint must be greater than or equal to ${bound}`,
      test: (current) => current >= bound,
    });
  }

  /**
   * Requires a value less than or equal to `bound` — inclusive, and itself a
   * `bigint`.
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
  max(bound: bigint, options?: SchemaOptions): BigintSchema {
    return this._withCheck({
      code: ISSUE_CODE.TOO_BIG,
      message: options?.message ?? `Bigint must be less than or equal to ${bound}`,
      test: (current) => current <= bound,
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

  // Clones rather than rebuilding, so a Shared Modifier already chained onto
  // this instance survives the added check — see ADR-0006's amendment.
  private _withCheck(check: BigintCheck): BigintSchema {
    const clone = this._withModifiers({});
    clone._checks = [...this._checks, check];
    return clone;
  }
}
