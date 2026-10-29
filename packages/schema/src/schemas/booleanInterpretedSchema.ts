import { coerceToBoolean } from '../coercions.js';
import { ISSUE_CODE } from '../issue/enums.js';
import { Issue } from '../issue/issue.js';
import type { Result } from '../result.js';
import type { InterpretedSchemaKind, RetypedSchema } from '../types.js';
import { ChainableInterpretedSchema } from './chainableInterpretedSchema.js';

/**
 * The default message of every Issue `BooleanInterpretedSchema` reports, keyed by the method
 * that reports it. `@pcvl/compiler` calls the same functions to write
 * each message into a Compiled Schema as a literal.
 *
 * @internal
 */
export const BOOLEAN_SCHEMA_ISSUE_MESSAGE = {
  _checkType: (): string => 'Expected boolean',
} as const;

interface BooleanInterpretedSchemaKind extends InterpretedSchemaKind<
  BooleanInterpretedSchema<unknown, unknown>
> {
  readonly type: BooleanInterpretedSchema<this['Input'], this['Output']>;
}

/**
 * Accepts a JavaScript `boolean`. Build one with `pvl.boolean()`.
 *
 * There is nothing to constrain beyond the type itself, so this schema has no
 * check methods of its own — only `.coerce()` and the modifiers every schema
 * shares. Note that `.coerce()` here is plain JavaScript truthiness, so the
 * string `'false'` becomes `true`.
 *
 * @example
 * ```ts
 * import { pvl } from '@pcvl/schema';
 *
 * const acceptedTerms = pvl.boolean();
 *
 * acceptedTerms.validate(true); // { value: true }
 * acceptedTerms.validate('true'); // { issues: [{ code: 'INVALID_TYPE', ... }] }
 *
 * // Only `true` will do:
 * const mustAccept = pvl.literal(true);
 * ```
 */
export class BooleanInterpretedSchema<
  Input = boolean,
  Output = boolean,
> extends ChainableInterpretedSchema<Input, Output> {
  /** @internal */
  declare readonly '~kind': BooleanInterpretedSchemaKind;

  /** @internal */
  constructor() {
    super();
  }

  /**
   * Converts a string, a number or a bigint with `Boolean()` before the type
   * check: plain JavaScript truthiness, so the string `'false'` becomes
   * `true`. Any other value is left as it is.
   *
   * @example
   * ```ts
   * import { pvl } from '@pcvl/schema';
   *
   * const enabled = pvl.boolean().coerce();
   *
   * enabled.validate(1); // { value: true }
   * enabled.validate(''); // { value: false }
   * enabled.validate(null); // { issues: [{ code: 'INVALID_TYPE', ... }] }
   * ```
   */
  coerce(): RetypedSchema<this, unknown, Output> {
    return this._withPreModifier<unknown, unknown>({
      fn: (value) => {
        return { value: coerceToBoolean(value) };
      },
    }) as unknown as RetypedSchema<this, unknown, Output>;
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<boolean> {
    if (typeof value !== 'boolean') {
      return {
        issues: [
          new Issue(ISSUE_CODE.INVALID_TYPE, path, BOOLEAN_SCHEMA_ISSUE_MESSAGE._checkType()),
        ],
      };
    }
    return { value };
  }
}
