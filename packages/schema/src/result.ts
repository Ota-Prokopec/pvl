import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Issue } from './issue.js';

// Derived from the spec's own `FailureResult` by intersection rather than
// re-declared, so this stays one representation that cannot drift from the
// spec's — see ADR-0011.
/**
 * The failing branch of a {@link Result}: an `issues` array describing every
 * reason the value was rejected. Narrowed to this library's {@link Issue}, so
 * `code` is readable alongside the spec's `message` and `path`.
 *
 * @example
 * ```ts
 * import { pvl, type FailureResult } from '@pvl/schema';
 *
 * const result = pvl.string().validate(42);
 * if (result.issues) {
 *   const failure: FailureResult = result;
 *   console.log(failure.issues[0]?.code); // 'INVALID_TYPE'
 * }
 * ```
 */
export type FailureResult = StandardSchemaV1.FailureResult & {
  readonly issues: ReadonlyArray<Issue>;
};

/**
 * What every `.validate()` call returns. It is a union of two branches, told
 * apart by whether `issues` is present: on success the accepted (and, after a
 * `.transform()`, transformed) value is on `value`; on failure `issues` lists
 * what was wrong. `.validate()` never throws for an invalid value.
 *
 * @example
 * ```ts
 * import { pvl, type Result } from '@pvl/schema';
 *
 * const result: Result<string> = pvl.string().validate('hello');
 * if (result.issues) {
 *   console.log(result.issues.map((issue) => issue.message));
 * } else {
 *   console.log(result.value); // 'hello'
 * }
 * ```
 */
export type Result<Output> = StandardSchemaV1.SuccessResult<Output> | FailureResult;
