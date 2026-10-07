import { coerceToBigint, coerceToBoolean, coerceToNumber, coerceToString } from '../coercions.js';
import { ISSUE_CODE, Issue } from '../issue.js';
import type { Result } from '../result.js';
import type { SchemaKind } from '../types.js';
import { ChainableSchema } from './chainableSchema.js';

/**
 * Every primitive type `pvl.literal()` can pin a schema to. Objects, arrays
 * and `null`/`undefined` are not literal values — use `pvl.object()`,
 * `pvl.array()` or the `.nullable()`/`.optional()` modifiers instead.
 *
 * @example
 * ```ts
 * import { pvl, type PossibleLiteralValue } from '@pvl/schema';
 *
 * const pinned: PossibleLiteralValue = 'OWNER';
 * const owner = pvl.literal(pinned);
 * ```
 */
export type PossibleLiteralValue = string | number | boolean | bigint;

interface LiteralSchemaKind<LiteralValue extends PossibleLiteralValue> extends SchemaKind<
  LiteralSchema<LiteralValue, unknown, unknown>
> {
  readonly type: LiteralSchema<LiteralValue, this['Input'], this['Output']>;
}

/**
 * Matches exactly one constant value. Build one with `pvl.literal(value)`.
 * A right-shaped value of the wrong type (`'42'` for `pvl.literal(42)`) is
 * rejected just like a wrong value is.
 *
 * The comparison is `Object.is`, not `===`, which matters for the two values
 * they disagree about: `pvl.literal(0)` rejects `-0` rather than accepting it
 * and handing back `0`, and `pvl.literal(NaN)` matches `NaN` rather than
 * being a schema nothing can satisfy.
 *
 * @example
 * ```ts
 * import { pvl } from '@pvl/schema';
 *
 * const owner = pvl.literal('OWNER');
 *
 * owner.validate('OWNER'); // { value: 'OWNER' }
 * owner.validate('MEMBER'); // { issues: [{ code: 'INVALID_VALUE', ... }] }
 *
 * // Literals are how a union gets a discriminant:
 * const event = pvl.union([
 *   pvl.object({ type: pvl.literal('created'), id: pvl.string() }),
 *   pvl.object({ type: pvl.literal('deleted'), id: pvl.string() }),
 * ]);
 * ```
 */
export class LiteralSchema<
  LiteralValue extends PossibleLiteralValue,
  Input = LiteralValue,
  Output = LiteralValue,
> extends ChainableSchema<Input, Output> {
  /** @internal */
  declare readonly '~kind': LiteralSchemaKind<LiteralValue>;
  private readonly literalValue: LiteralValue;

  /** @internal */
  constructor(literalValue: LiteralValue) {
    super();
    this.literalValue = literalValue;
  }

  /**
   * A literal pins the schema to one primitive type, so `.coerce()` has an
   * unambiguous target: convert the input exactly as the matching primitive
   * schema would, then let the equality check decide. An unconvertible input
   * falls through unchanged and fails that check.
   *
   * @internal
   */
  override _coerceInput(value: unknown): unknown {
    switch (typeof this.literalValue) {
      case 'string':
        return coerceToString(value);
      case 'number':
        return coerceToNumber(value);
      case 'boolean':
        return coerceToBoolean(value);
      default:
        return coerceToBigint(value);
    }
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<LiteralValue> {
    if (!Object.is(value, this.literalValue)) {
      return {
        issues: [
          new Issue(
            ISSUE_CODE.INVALID_VALUE,
            path,
            `Expected ${Issue.formatIssueMessageValue(this.literalValue)}`,
          ),
        ],
      };
    }
    return { value } as Result<LiteralValue>;
  }
}
