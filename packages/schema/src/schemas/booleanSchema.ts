import { coerceToBoolean } from '../coercions.js';
import { ISSUE_CODE } from '../enums.js';
import { Issue } from '../issue.js';
import type { Result } from '../result.js';
import type { SchemaKind } from '../types.js';
import { ChainableSchema } from './chainableSchema.js';

/**
 * The default message of every Issue `BooleanSchema` reports, keyed by the method
 * that reports it. `@pvl/schema-compiler` calls the same functions to write
 * each message into a Compiled Schema as a literal.
 *
 * @internal
 */
export const BOOLEAN_SCHEMA_ISSUE_MESSAGE = {
  _checkType: (): string => 'Expected boolean',
} as const;

interface BooleanSchemaKind extends SchemaKind<BooleanSchema<unknown, unknown>> {
  readonly type: BooleanSchema<this['Input'], this['Output']>;
}

/**
 * Accepts a JavaScript `boolean`. Build one with `pvl.boolean()`.
 *
 * There is nothing to constrain beyond the type itself, so this schema has no
 * check methods of its own — only the modifiers every schema shares. Note
 * that `.coerce()` here is plain JavaScript truthiness, so the string
 * `'false'` becomes `true`.
 *
 * @example
 * ```ts
 * import { pvl } from '@pvl/schema';
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
export class BooleanSchema<Input = boolean, Output = boolean> extends ChainableSchema<
  Input,
  Output
> {
  /** @internal */
  declare readonly '~kind': BooleanSchemaKind;

  /** @internal */
  constructor() {
    super();
  }

  /** @internal */
  override _coerceInput(value: unknown): unknown {
    return coerceToBoolean(value);
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
