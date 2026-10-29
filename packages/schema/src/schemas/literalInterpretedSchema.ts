import { coerceToBigint, coerceToBoolean, coerceToNumber, coerceToString } from '../coercions.js';
import { ISSUE_CODE } from '../issue/enums.js';
import { Issue } from '../issue/issue.js';
import type { Result } from '../result.js';
import type { InterpretedSchemaKind, RetypedSchema } from '../types.js';
import { ChainableInterpretedSchema } from './chainableInterpretedSchema.js';

/**
 * Every primitive type `pvl.literal()` can pin a schema to. Objects, arrays
 * and `null`/`undefined` are not literal values — use `pvl.object()`,
 * `pvl.array()` or the `.nullable()`/`.optional()` modifiers instead.
 *
 * @example
 * ```ts
 * import { pvl, type PossibleLiteralValue } from '@pcvl/schema';
 *
 * const pinned: PossibleLiteralValue = 'OWNER';
 * const owner = pvl.literal(pinned);
 * ```
 */
export type PossibleLiteralValue = string | number | boolean | bigint;

/**
 * The default message of every Issue `LiteralInterpretedSchema` reports, keyed by the method
 * that reports it. `@pcvl/compiler` calls the same functions to write
 * each message into a Compiled Schema as a literal.
 *
 * @internal
 */
export const LITERAL_SCHEMA_ISSUE_MESSAGE = {
  _checkType: (literalValue: PossibleLiteralValue): string =>
    `Expected ${Issue.formatIssueMessageValue(literalValue)}`,
} as const;

interface LiteralInterpretedSchemaKind<
  LiteralValue extends PossibleLiteralValue,
> extends InterpretedSchemaKind<LiteralInterpretedSchema<LiteralValue, unknown, unknown>> {
  readonly type: LiteralInterpretedSchema<LiteralValue, this['Input'], this['Output']>;
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
 * import { pvl } from '@pcvl/schema';
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
export class LiteralInterpretedSchema<
  LiteralValue extends PossibleLiteralValue,
  Input = LiteralValue,
  Output = LiteralValue,
> extends ChainableInterpretedSchema<Input, Output> {
  /** @internal */
  declare readonly '~kind': LiteralInterpretedSchemaKind<LiteralValue>;
  private readonly literalValue: LiteralValue;

  /** @internal */
  constructor(literalValue: LiteralValue) {
    super();
    this.literalValue = literalValue;
  }

  /**
   * Converts the raw input before the check, exactly as the primitive schema
   * of the literal's own type would: `pvl.literal(1).coerce()` converts as
   * `pvl.number().coerce()` does. The equality check then decides, so an
   * input that doesn't convert to the literal fails it.
   *
   * @example
   * ```ts
   * import { pvl } from '@pcvl/schema';
   *
   * const one = pvl.literal(1).coerce();
   *
   * one.validate('1'); // { value: 1 }
   * one.validate('2'); // { issues: [{ code: 'INVALID_VALUE', ... }] }
   * ```
   */
  coerce(): RetypedSchema<this, unknown, Output> {
    return this._withPreModifier<unknown, unknown>({
      fn: (value) => {
        switch (typeof this.literalValue) {
          case 'string':
            return { value: coerceToString(value) };
          case 'number':
            return { value: coerceToNumber(value) };
          case 'boolean':
            return { value: coerceToBoolean(value) };
          default:
            return { value: coerceToBigint(value) };
        }
      },
    }) as unknown as RetypedSchema<this, unknown, Output>;
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<LiteralValue> {
    if (!Object.is(value, this.literalValue)) {
      return {
        issues: [
          new Issue(
            ISSUE_CODE.INVALID_VALUE,
            path,
            LITERAL_SCHEMA_ISSUE_MESSAGE._checkType(this.literalValue),
          ),
        ],
      };
    }
    return { value } as Result<LiteralValue>;
  }
}
