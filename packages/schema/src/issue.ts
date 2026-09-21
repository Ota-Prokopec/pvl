import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { ValueOfEnum } from "@repo/types";

export const ISSUE_CODE = {
  INVALID_TYPE: "INVALID_TYPE",
  TOO_SMALL: "TOO_SMALL",
  TOO_BIG: "TOO_BIG",
  INVALID_LENGTH: "INVALID_LENGTH",
  CUSTOM: "CUSTOM",
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

export type Result<Output> = StandardSchemaV1.Result<Output>;

export const buildIssue = (
  code: IssueCode,
  message: string,
  path: ReadonlyArray<PropertyKey>,
): Issue => ({
  code,
  message,
  ...(path.length > 0 ? { path: [...path] } : {}),
});
