import { coerceToBoolean } from '../coercions.js';
import { ISSUE_CODE, Issue } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaKind } from './schema.js';

interface BooleanSchemaKind extends SchemaKind {
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
export class BooleanSchema<Input = boolean, Output = boolean> extends Schema<Input, Output> {
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
        issues: [new Issue(ISSUE_CODE.INVALID_TYPE, path, 'Expected boolean')],
      };
    }
    return { value };
  }
}
