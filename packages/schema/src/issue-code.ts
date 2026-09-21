import type { ValueOfEnum } from "@repo/types";

export const ISSUE_CODE = {
  INVALID_TYPE: "INVALID_TYPE",
  TOO_SMALL: "TOO_SMALL",
  TOO_BIG: "TOO_BIG",
  INVALID_LENGTH: "INVALID_LENGTH",
  CUSTOM: "CUSTOM",
} as const;

export type IssueCode = ValueOfEnum<typeof ISSUE_CODE>;
