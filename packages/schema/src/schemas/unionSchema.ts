import type { StandardSchemaV1 } from '@standard-schema/spec';
import { ISSUE_CODE, Issue, type IssueEditableProps } from '../issue.js';
import type { Result } from '../result.js';
import { Schema, type SchemaKind } from './schema.js';

/**
 * The alternative schemas a union tries, in the order given. The first member
 * that accepts the value wins, so order matters where two members overlap.
 *
 * @example
 * ```ts
 * import { pvl, type UnionMembers } from '@pvl/schema';
 *
 * const members = [pvl.string(), pvl.number()] as const satisfies UnionMembers;
 * const id = pvl.union(members);
 * ```
 */
export type UnionMembers = ReadonlyArray<Schema<unknown, unknown>>;

// Homomorphic mapped tuple types: mapping over `Members` (a tuple when the
// `pvl.union()` factory infers it via `const`) preserves its tuple shape, so
// indexing the result with `[number]` yields the true union of each member's
// own input/output type rather than a single merged type.
type MemberInputs<Members extends UnionMembers> = {
  [Index in keyof Members]: StandardSchemaV1.InferInput<Members[Index]>;
};

type MemberOutputs<Members extends UnionMembers> = {
  [Index in keyof Members]: StandardSchemaV1.InferOutput<Members[Index]>;
};

/**
 * The union of every member's own input type — what a value must match going
 * in.
 *
 * @example
 * ```ts
 * import { pvl, type UnionInput } from '@pvl/schema';
 *
 * const members = [pvl.string(), pvl.number()] as const;
 * const id: UnionInput<typeof members> = 42; // string | number
 *
 * pvl.union(members).validate(id);
 * ```
 */
export type UnionInput<Members extends UnionMembers> = MemberInputs<Members>[number];

/**
 * The union of every member's own output type — what a successful validation
 * hands back, after the winning member's own `.transform()` has run.
 *
 * @example
 * ```ts
 * import { pvl, type UnionOutput } from '@pvl/schema';
 *
 * const members = [pvl.string(), pvl.number().transform(String)] as const;
 * const out: UnionOutput<typeof members> = 'either way a string';
 * ```
 */
export type UnionOutput<Members extends UnionMembers> = MemberOutputs<Members>[number];

interface UnionSchemaKind<Members extends UnionMembers> extends SchemaKind {
  readonly type: UnionSchema<Members, this['Input'], this['Output']>;
}

/**
 * Tries each member schema in the order given and succeeds on the first that
 * accepts the value. Build one with `pvl.union(members)`.
 *
 * Every member is attempted — there is no discriminated-union fast path that
 * dispatches on a shared key. Each member runs through its own full pipeline
 * at the same path as the union itself, since a member is an alternative, not
 * a nested field.
 *
 * When no member accepts the value, the issues are every member's own
 * rejection, collected rather than replaced by one generic message. Pass
 * `{ message }` to replace them with a single `INVALID_UNION` issue where the
 * per-member detail would be noise.
 *
 * `.coerce()` is inherited but does nothing here — the members can be
 * unrelated types, so there is no single conversion target. A member that
 * needs coercion opts into it on its own schema.
 *
 * @example
 * ```ts
 * import { pvl } from '@pvl/schema';
 *
 * const id = pvl.union([pvl.string(), pvl.number().int()]);
 *
 * id.validate('a1'); // { value: 'a1' }
 * id.validate(true); // { issues: [...] } — one issue per rejecting member
 *
 * const quiet = pvl.union([pvl.string(), pvl.number()], { message: 'expected an id' });
 * quiet.validate(true); // { issues: [{ code: 'INVALID_UNION', message: 'expected an id' }] }
 * ```
 */
export class UnionSchema<
  Members extends UnionMembers,
  Input = UnionInput<Members>,
  Output = UnionOutput<Members>,
> extends Schema<Input, Output> {
  declare readonly '~kind': UnionSchemaKind<Members>;
  private readonly _members: Members;
  private readonly _message: string | undefined;

  /** @internal */
  constructor(members: Members, options?: IssueEditableProps) {
    super();
    this._members = members;
    this._message = options?.message;
  }

  /** @internal */
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
        issues: [new Issue(ISSUE_CODE.INVALID_UNION, path, this._message)],
      };
    }
    return { issues: rejections };
  }
}
