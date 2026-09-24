import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Issue } from './issue.js';

/**
 * The spec's own failure result, narrowed to this package's `Issue` so a
 * caller can read `code` off it. Derived from `StandardSchemaV1.FailureResult`
 * by intersection rather than re-declared, so this stays one representation
 * that can't drift from the spec's — see ADR-0011.
 */
export type FailureResult = StandardSchemaV1.FailureResult & {
  readonly issues: ReadonlyArray<Issue>;
};

export type Result<Output> = StandardSchemaV1.SuccessResult<Output> | FailureResult;
