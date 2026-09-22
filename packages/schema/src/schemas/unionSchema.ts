import type { StandardSchemaV1 } from '@standard-schema/spec';
import { buildIssue, ISSUE_CODE, type Issue, type Result } from '../issue.js';
import { Schema, type SchemaOptions } from './baseSchema.js';

/** The alternative schemas a `UnionSchema` tries, in the order given. */
export type UnionMembers = ReadonlyArray<Schema<unknown, unknown>>;

/**
 * Homomorphic mapped tuple types: mapping over `Members` (a tuple when the
 * `pvl.union()` factory infers it via `const`) preserves its tuple shape, so
 * indexing the result with `[number]` yields the true union of each member's
 * own input/output type rather than a single merged type.
 */
type MemberInputs<Members extends UnionMembers> = {
  [Index in keyof Members]: StandardSchemaV1.InferInput<Members[Index]>;
};

type MemberOutputs<Members extends UnionMembers> = {
  [Index in keyof Members]: StandardSchemaV1.InferOutput<Members[Index]>;
};

export type UnionInput<Members extends UnionMembers> = MemberInputs<Members>[number];

export type UnionOutput<Members extends UnionMembers> = MemberOutputs<Members>[number];

/**
 * Plain union only, per v1 scope: tries each member schema in order and
 * succeeds on the first one that accepts the value. There is no
 * discriminated-union fast path/dispatch on a shared key — every member is
 * attempted regardless of shape.
 *
 * Each member is validated through its own full pipeline (its own
 * `.optional()`/`.nullable()`/`.coerce()`/`.refine()`/`.transform()`), at the
 * same path as the union itself — a member isn't a nested field, so no path
 * segment is appended the way `object`/`array` append a key/index.
 *
 * `.coerce()` is inherited but has no union-specific conversion: the members
 * can be unrelated types, so there is no single target type to convert an
 * input to. A member that needs coercion opts into it on its own schema.
 *
 * A failing value's `Issue`s are every member's own rejection, collected
 * rather than replaced by one generic "no alternative matched" message — see
 * docs/adr/0012-composite-schemas-collect-every-issue.md, which earmarks
 * union for reporting what every member rejected. `{ message }` still
 * overrides this with a single custom `Issue` when the per-member detail
 * would be noise for a given union.
 */
export class UnionSchema<Members extends UnionMembers> extends Schema<
  UnionInput<Members>,
  UnionOutput<Members>
> {
  private readonly _members: Members;
  private readonly _message: string | undefined;

  constructor(members: Members, options?: SchemaOptions) {
    super();
    this._members = members;
    this._message = options?.message;
  }

  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<UnionOutput<Members>> {
    const rejections: Issue[] = [];
    for (const member of this._members) {
      const result = member._validate(value, path);
      if (!result.issues) {
        return { value: result.value as UnionOutput<Members> };
      }
      rejections.push(...result.issues);
    }
    if (this._message !== undefined) {
      return {
        issues: [buildIssue(ISSUE_CODE.INVALID_UNION, this._message, path)],
      };
    }
    return { issues: rejections };
  }
}
