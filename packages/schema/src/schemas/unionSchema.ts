import { ISSUE_CODE } from '../enums.js';
import { Issue } from '../issue.js';
import type { Result } from '../result.js';
import type { InferInput, InferOutput, SchemaKind } from '../types.js';
import { ChainableSchema } from './chainableSchema.js';
import type { Schema } from './schema.js';

/**
 * One schema a union tries: any `@pvl/schema` Schema.
 *
 * @example
 * ```ts
 * import { pvl, type UnionMember } from '@pvl/schema';
 *
 * const member: UnionMember = pvl.string();
 * pvl.union([member, pvl.number()]);
 * ```
 */
export type UnionMember = Schema<unknown, unknown>;

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
export type UnionMembers = ReadonlyArray<UnionMember>;

// `Members[number]` is the union of the member schemas, and inferring through
// a union of schemas yields the union of each member's own type.

/**
 * The default message of every Issue `UnionSchema` reports, keyed by the method
 * that reports it. `@pvl/schema-compiler` calls the same functions to write
 * each message into a Compiled Schema as a literal.
 *
 * @internal
 */
export const UNION_SCHEMA_ISSUE_MESSAGE = {
  _checkType: (): string => 'Value matches no union member',
} as const;

interface UnionSchemaKind<Members extends UnionMembers> extends SchemaKind<
  UnionSchema<Members, unknown, unknown>
> {
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
 * When no member accepts the value, the issues are one `INVALID_UNION` issue
 * at the union's own path, followed by every member's own rejection in
 * member order, so the detail of why each alternative failed is kept.
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
 * id.validate(true);
 * // { issues: [
 * //   { code: 'INVALID_UNION', message: UNION_SCHEMA_ISSUE_MESSAGE._checkType() },
 * //   { code: 'INVALID_TYPE', message: 'Expected string' },
 * //   { code: 'INVALID_TYPE', message: 'Expected number' },
 * // ] }
 * ```
 */
export class UnionSchema<
  Members extends UnionMembers,
  Input = InferInput<Members[number]>,
  Output = InferOutput<Members[number]>,
> extends ChainableSchema<Input, Output> {
  /** @internal */
  declare readonly '~kind': UnionSchemaKind<Members>;
  private readonly _members: Members;

  /** @internal */
  constructor(members: Members) {
    super();
    this._members = members;
  }

  /** @internal */
  _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): Result<Output> {
    const rejections: Issue[] = [];

    for (const member of this._members) {
      const result = member._validate(value, path);
      if (!result.issues) {
        return { value: result.value as Output };
      }
      rejections.push(...result.issues);
    }
    return {
      issues: [
        new Issue(ISSUE_CODE.INVALID_UNION, path, UNION_SCHEMA_ISSUE_MESSAGE._checkType()),
        ...rejections,
      ],
    };
  }
}
