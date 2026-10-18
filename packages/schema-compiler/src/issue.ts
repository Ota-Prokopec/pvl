// How the emitted code reports an Issue: the Issue literal a failed check
// pushes onto `issues`, and the fragments a `Frame` places around the checks
// to return the Issues collected so far.
import { Issue, type IssueCode } from '@pvl/schema';
import { js } from './emitters/emitterUtils.js';
import type { EmittedIssue } from './types.js';

/**
 * An Issue as a plain object literal, importing nothing. `path` is an
 * expression, not the path itself. The message goes through `@pvl/schema`'s
 * own `Issue`, so an empty custom message falls back to its default exactly
 * as the interpreted path's does.
 *
 * ```ts
 * emitIssue('TOO_SMALL', 'too short', '[...path, "name"]')
 * // '{ code: "TOO_SMALL", message: "too short", path: [...path, "name"] }'
 * ```
 */
export const emitIssue = (code: IssueCode, message: string, path: string): EmittedIssue => {
  const issueMessage = new Issue(code, [], message).message;
  return js`{ code: ${JSON.stringify(code)}, message: ${JSON.stringify(issueMessage)}, path: ${path} }` as EmittedIssue;
};

/**
 * The condition under which no Issue was added since `issueCount`, the
 * local holding the count of Issues taken before a nested composite's
 * children: every child passed.
 *
 * ```ts
 * emitNoNewIssuesCondition('issueCount1') // 'issues.length === issueCount1'
 * ```
 */
export const emitNoNewIssuesCondition = (issueCountVariableName: string): string => {
  return js`issues.length === ${issueCountVariableName}`;
};

/**
 * The statement returning the Issues collected so far: at the root, after a
 * base check whose `else` returns the value, so it runs only once that check
 * has failed.
 *
 * ```ts
 * emitReturnIssues() // 'return { issues };'
 * ```
 */
export const emitReturnIssues = (): string => {
  return 'return { issues };';
};

/**
 * The statement returning the Issues collected so far, if there are any.
 *
 * ```ts
 * emitReturnIssuesIfAny() // 'if (issues.length > 0) {\n  return { issues };\n}'
 * ```
 */
export const emitReturnIssuesIfAny = (): string => {
  return js`if (issues.length > 0) {
    return { issues };
  }`;
};
