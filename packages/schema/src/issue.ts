import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ValueOfEnum } from '@repo/types';

/**
 * Every `code` an {@link Issue} can carry. Match on these rather than on
 * `message`, which is prose and can be replaced per call site with a custom
 * `{ message }` option.
 *
 * @example
 * ```ts
 * import { ISSUE_CODE, pvl } from '@pvl/schema';
 *
 * const result = pvl.string().min(3).validate('hi');
 * if (result.issues) {
 *   result.issues[0]?.code === ISSUE_CODE.TOO_SMALL; // true
 * }
 * ```
 */
export const ISSUE_CODE = {
  INVALID_TYPE: 'INVALID_TYPE',
  INVALID_VALUE: 'INVALID_VALUE',
  TOO_SMALL: 'TOO_SMALL',
  TOO_BIG: 'TOO_BIG',
  INVALID_LENGTH: 'INVALID_LENGTH',
  NOT_INTEGER: 'NOT_INTEGER',
  UNRECOGNIZED_KEY: 'UNRECOGNIZED_KEY',
  INVALID_UNION: 'INVALID_UNION',
  CUSTOM: 'CUSTOM',
} as const;

/**
 * The union of {@link ISSUE_CODE}'s values — the type of {@link Issue}'s
 * `code` field.
 *
 * @example
 * ```ts
 * import { ISSUE_CODE, type IssueCode } from '@pvl/schema';
 *
 * const isSizeProblem = (code: IssueCode): boolean =>
 *   code === ISSUE_CODE.TOO_SMALL || code === ISSUE_CODE.TOO_BIG;
 * ```
 */
export type IssueCode = ValueOfEnum<typeof ISSUE_CODE>;

// Extra fields stay structurally compatible with `StandardSchemaV1.Issue`, so
// this is the single representation returned by both `.validate()` and
// `"~standard".validate`.
/**
 * One reason a value was rejected: a machine-matchable {@link IssueCode}, a
 * human-readable `message`, and — for a failure inside an object, array or
 * nested combination of the two — the `path` to where it happened. A failure
 * reported at the root may omit `path` entirely.
 *
 * @example
 * ```ts
 * import { pvl, type Issue } from '@pvl/schema';
 *
 * const result = pvl.object({ name: pvl.string() }).validate({ name: 42 });
 * if (result.issues) {
 *   const issue: Issue = result.issues[0]!;
 *   console.log(issue.code, issue.path, issue.message);
 *   // 'INVALID_TYPE' [ 'name' ] 'Expected string'
 * }
 * ```
 */
export type Issue = StandardSchemaV1.Issue & {
  readonly code: IssueCode;
};

/**
 * Renders a value for a default `Issue` message — strings quoted so an empty
 * or space-padded one is visible in the message. `JSON.stringify` is avoided
 * because it throws on `bigint`.
 *
 * @internal
 */
export const formatIssueMessageValue = (value: string | number | boolean | bigint): string =>
  typeof value === 'string' ? `"${value}"` : String(value);

/**
 * Builds one `Issue`, omitting `path` entirely at the root rather than
 * emitting an empty array.
 *
 * @internal
 */
export const buildIssue = (
  code: IssueCode,
  message: string,
  path: ReadonlyArray<PropertyKey>,
): Issue => ({
  code,
  message,
  ...(path.length > 0 ? { path: [...path] } : {}),
});
