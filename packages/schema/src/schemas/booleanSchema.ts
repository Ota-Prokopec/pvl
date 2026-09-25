import { coerceToBoolean } from '../coercions.js';
import { buildIssue, ISSUE_CODE } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

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
export class BooleanSchema extends Schema<boolean, boolean> {
  private readonly _typeMessage: string;

  /** @internal */
  constructor(options?: SchemaOptions) {
    super();
    this._typeMessage = options?.message ?? 'Expected boolean';
  }

  /** @internal */
  override _coerceInput(value: unknown): unknown {
    return coerceToBoolean(value);
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<boolean> {
    if (typeof value !== 'boolean') {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_TYPE, this._typeMessage, path)],
      };
    }
    return { value };
  }
}
