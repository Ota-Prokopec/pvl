import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { IssueCode } from './enums.js';

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
export class Issue implements StandardSchemaV1.Issue {
  /**
   * Which check failed, as one of the `ISSUE_CODE` values.
   *
   * @example
   * ```ts
   * import { ISSUE_CODE, pvl } from '@pvl/schema';
   *
   * const result = pvl.number().int().validate(1.5);
   * result.issues?.[0]?.code === ISSUE_CODE.NOT_INTEGER; // true
   * ```
   */
  public code: IssueCode;
  /**
   * A human-readable description of the failure: the check's default, or the
   * `{ message }` passed to the Modifier that reported it.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const result = pvl.string().min(3, { message: 'too short' }).validate('hi');
   * result.issues?.[0]?.message; // 'too short'
   * ```
   */
  public message: string = 'Invalid type';
  /**
   * Where in the validated value the failure is: object keys and array
   * indices from the root. `undefined` for a failure at the root itself.
   *
   * @example
   * ```ts
   * import { pvl } from '@pvl/schema';
   *
   * const result = pvl.object({ tags: pvl.array(pvl.string()) }).validate({ tags: ['a', 1] });
   * result.issues?.[0]?.path; // ['tags', 1]
   * ```
   */
  public path: ReadonlyArray<PropertyKey> | undefined = undefined;

  /** @internal */
  constructor(code: IssueCode, path: ReadonlyArray<PropertyKey>, message?: string) {
    this.code = code;
    this.message = message ? message : this.message;
    this.path = path.length > 0 ? path : undefined;
  }

  // Static and pure: a schema renders its default message once at
  // construction, before any `Issue` exists to call it on.
  /**
   * Renders a value for a default `Issue` message — strings quoted so an empty
   * or space-padded one is visible in the message. `JSON.stringify` is avoided
   * because it throws on `bigint`.
   *
   * @internal
   */
  static formatIssueMessageValue(value: string | number | boolean | bigint): string {
    return typeof value === 'string' ? `"${value}"` : String(value);
  }
}

/**
 * The data an {@link Issue} carries: its `code`, `message` and `path`.
 *
 * @example
 * ```ts
 * import { pvl, type IssueProps } from '@pvl/schema';
 *
 * const result = pvl.string().validate(42);
 * const failures: IssueProps[] = result.issues ? [...result.issues] : [];
 * ```
 */
export type IssueProps = Pick<Issue, 'code' | 'message' | 'path'>;
/**
 * The options a Modifier that reports an {@link Issue} takes: a custom
 * `message` replacing the check's default.
 *
 * @example
 * ```ts
 * import { pvl, type IssueEditableProps } from '@pvl/schema';
 *
 * const options: IssueEditableProps = { message: 'must be at least 3 characters' };
 * pvl.string().min(3, options);
 * ```
 */
export type IssueEditableProps = Partial<Pick<IssueProps, 'message'>>;
