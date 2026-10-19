// Every `code` an Issue can carry.
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
