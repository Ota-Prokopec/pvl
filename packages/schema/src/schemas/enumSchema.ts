import type { ValueOfEnum } from '@repo/types';
import { buildIssue, formatValue, ISSUE_CODE, type Result } from '../issue.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

/** A single accepted enum value, in either source form. */
export type EnumMember = string | number;

/** The repo's mandated `as const` enum-object shape (see docs/specification/enums-and-constants.md). */
export type EnumObjectSource = Readonly<Record<string, EnumMember>>;

/** An ad hoc array of string literals, for sets that don't warrant a named enum object. */
export type EnumArraySource = ReadonlyArray<string>;

/** Either source form `pvl.enum()` accepts — see ADR-0009. */
export type EnumSource = EnumObjectSource | EnumArraySource;

/**
 * The union of values an `EnumSchema` accepts. The array form's members are
 * the array's own element types; the `as const` object form resolves through
 * `@repo/types`' `ValueOfEnum`, the repo-wide way to read an enum object's
 * value union (see docs/standards/typescript.md).
 */
export type EnumOutput<Source extends EnumSource> = Source extends EnumArraySource
  ? Source[number]
  : ValueOfEnum<Source>;

const toMembers = (source: EnumSource): ReadonlyArray<EnumMember> =>
  Array.isArray(source) ? source : Object.values(source);

const formatMembers = (members: ReadonlyArray<EnumMember>): string =>
  members.map(formatValue).join(', ');

/**
 * Accepts one of a fixed set of values, sourced from either an `as const`
 * enum object or an array of string literals. Membership is a `Set` lookup
 * rather than a scan, so the check stays O(1) however large the set is.
 *
 * `.coerce()` is inherited but has no enum-specific conversion: a source can
 * mix string and number members, so there is no single target type to convert
 * an input to. A consumer who needs one converts before calling `.validate()`.
 */
export class EnumSchema<Source extends EnumSource> extends Schema<
  EnumOutput<Source>,
  EnumOutput<Source>
> {
  private readonly _members: ReadonlySet<EnumMember>;
  private readonly _message: string;

  constructor(source: Source, options?: SchemaOptions) {
    super();
    const members = toMembers(source);
    this._members = new Set(members);
    this._message = options?.message ?? `Expected one of ${formatMembers(members)}`;
  }

  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<EnumOutput<Source>> {
    if (!this._members.has(value as EnumMember)) {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_VALUE, this._message, path)],
      };
    }
    return { value: value as EnumOutput<Source> };
  }
}
