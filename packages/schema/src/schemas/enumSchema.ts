import type { ValueOfEnum } from '@repo/types';
import { buildIssue, formatIssueMessageValue, ISSUE_CODE } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

/**
 * A single accepted enum value, in either source form. Values may be strings
 * or numbers, and one `as const` enum object may mix the two.
 *
 * @example
 * ```ts
 * import type { EnumMember } from '@pvl/schema';
 *
 * const member: EnumMember = 'OWNER';
 * const numericMember: EnumMember = 404;
 * ```
 */
export type EnumMember = string | number;

/**
 * The `as const` enum-object source form — an object whose values are the
 * accepted set.
 *
 * @example
 * ```ts
 * import { pvl, type EnumObjectSource } from '@pvl/schema';
 *
 * const SYSTEM_ROLE = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const satisfies EnumObjectSource;
 * const role = pvl.enum(SYSTEM_ROLE); // accepts 'OWNER' | 'MEMBER'
 * ```
 */
export type EnumObjectSource = Readonly<Record<string, EnumMember>>;

/**
 * The array source form — an ad hoc list of string literals, for sets that do
 * not warrant first declaring a named enum object.
 *
 * @example
 * ```ts
 * import { pvl, type EnumArraySource } from '@pvl/schema';
 *
 * const sizes: EnumArraySource = ['small', 'medium', 'large'];
 * const size = pvl.enum(['small', 'medium', 'large']);
 * ```
 */
export type EnumArraySource = ReadonlyArray<string>;

/**
 * Either source form `pvl.enum()` accepts. Both produce the same kind of
 * schema; only the shape you hand the factory differs.
 *
 * @example
 * ```ts
 * import { pvl, type EnumSource } from '@pvl/schema';
 *
 * const fromObject: EnumSource = { OWNER: 'OWNER' } as const;
 * const fromArray: EnumSource = ['OWNER'];
 *
 * pvl.enum(fromArray);
 * ```
 */
export type EnumSource = EnumObjectSource | EnumArraySource;

/**
 * The union of values an enum schema accepts, resolved from whichever source
 * form was used. This is the type `.validate()` hands back on success.
 *
 * @example
 * ```ts
 * import { pvl, type EnumOutput } from '@pvl/schema';
 *
 * const SYSTEM_ROLE = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const;
 *
 * type Role = EnumOutput<typeof SYSTEM_ROLE>; // 'OWNER' | 'MEMBER'
 * type Size = EnumOutput<['small', 'large']>; // 'small' | 'large'
 *
 * const role = pvl.enum(SYSTEM_ROLE);
 * ```
 */
export type EnumOutput<Source extends EnumSource> = Source extends EnumArraySource
  ? Source[number]
  : ValueOfEnum<Source>;

const toEnumMembers = (source: EnumSource): ReadonlyArray<EnumMember> =>
  Array.isArray(source) ? source : Object.values(source);

/**
 * Accepts one of a fixed set of values, sourced from either an `as const`
 * enum object or an array of string literals. Build one with
 * `pvl.enum(source)`. Membership is a `Set` lookup, so the check stays O(1)
 * however large the set is.
 *
 * `.coerce()` is inherited but does nothing here: a source may mix string and
 * number members, so there is no single target type to convert an input to.
 * Convert before calling `.validate()` if you need that.
 *
 * @example
 * ```ts
 * import { pvl } from '@pvl/schema';
 *
 * const SYSTEM_ROLE = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const;
 * const role = pvl.enum(SYSTEM_ROLE);
 *
 * role.validate('OWNER'); // { value: 'OWNER' }
 * role.validate('GUEST'); // { issues: [{ code: 'INVALID_VALUE', ... }] }
 *
 * // Or without a named enum object:
 * pvl.enum(['small', 'medium', 'large']).validate('medium'); // { value: 'medium' }
 * ```
 */
export class EnumSchema<Source extends EnumSource> extends Schema<
  EnumOutput<Source>,
  EnumOutput<Source>
> {
  private readonly _members: ReadonlySet<EnumMember>;
  private readonly _message: string;

  /** @internal */
  constructor(source: Source, options?: SchemaOptions) {
    super();
    const members = toEnumMembers(source);
    this._members = new Set(members);
    this._message =
      options?.message ??
      `Expected one of ${members.map((enumMember) => formatIssueMessageValue(enumMember)).join(', ')}`;
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<EnumOutput<Source>> {
    if (!this._members.has(value as EnumMember)) {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_VALUE, this._message, path)],
      };
    }
    return { value: value as EnumOutput<Source> };
  }
}
