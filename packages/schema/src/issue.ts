import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { ValueOfEnum } from '@repo/types';

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

export type IssueCode = ValueOfEnum<typeof ISSUE_CODE>;

/**
 * Extends the base Standard Schema `Issue` with a `code` for programmatic
 * matching. Extra fields are structurally compatible with
 * `StandardSchemaV1.Issue` (message/path), so this stays the single
 * representation returned by both `.validate()` and `"~standard".validate`.
 */
export type Issue = StandardSchemaV1.Issue & {
  readonly code: IssueCode;
};

/**
 * Renders a value for a default `Issue` message — strings quoted so an empty
 * or space-padded one is visible in the message. `JSON.stringify` is avoided
 * because it throws on `bigint`.
 */
export const formatIssueMessageValue = (value: string | number | boolean | bigint): string =>
  typeof value === 'string' ? `"${value}"` : String(value);

export const buildIssue = (
  code: IssueCode,
  message: string,
  path: ReadonlyArray<PropertyKey>,
): Issue => ({
  code,
  message,
  ...(path.length > 0 ? { path: [...path] } : {}),
});
