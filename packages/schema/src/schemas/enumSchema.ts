import type { ValueOfEnum } from '@repo/types';
import { ISSUE_CODE, Issue, type IssueEditableProps } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaKind } from './schema.js';

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

type EnumObjectSource = Readonly<Record<string, EnumMember>>;
type EnumArraySource = ReadonlyArray<string>;

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

interface EnumSchemaKind<Source extends EnumSource> extends SchemaKind {
  readonly type: EnumSchema<Source, this['Input'], this['Output']>;
}

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
export class EnumSchema<
  Source extends EnumSource,
  Input = ValueOfEnum<Source>,
  Output = ValueOfEnum<Source>,
> extends Schema<Input, Output> {
  declare readonly '~kind': EnumSchemaKind<Source>;
  private readonly members: ReadonlySet<EnumMember>;

  /** @internal */
  constructor(source: Source, options?: IssueEditableProps) {
    super();
    const members = Array.isArray(source) ? source : Object.values(source);
    this.members = new Set(members);
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Output> {
    if (!this.members.has(value as EnumMember)) {
      return {
        issues: [
          new Issue(
            ISSUE_CODE.INVALID_VALUE,
            path,
            `Expected one of ${Array.from(this.members)
              .map((enumMember) => Issue.formatIssueMessageValue(enumMember))
              .join(', ')}`,
          ),
        ],
      };
    }
    return { value: value as Output };
  }
}
