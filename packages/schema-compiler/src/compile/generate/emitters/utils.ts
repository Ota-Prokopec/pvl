// What every emitter shares: the `js` tag its templates are written with,
// the shapes it hands back, and how an Issue and a value are spelled as
// literals in the emitted code.
import { Issue, type IssueCode, type PossibleLiteralValue } from '@pvl/schema';

/**
 * Tags a template holding emitted JavaScript, so it reads as code: the text
 * comes back exactly as written, backslashes included.
 *
 * ```ts
 * js`typeof ${'field0'} !== "string"` // 'typeof field0 !== "string"'
 * ```
 */
export const js = String.raw;

/** What an emitted check reads: the value it checks and the Issue path it reports at, each as an expression. */
export type EmitTarget = {
  /** The checked value, as an expression: `value`, `field0`, `element`. */
  value: string;
  /** The `path` of an Issue reported for it, as an expression: `[...path, "name"]`. */
  path: string;
};

/** One check: the condition it fails under, and the Issue literal it reports then. */
export type EmittedCheck = {
  failsWhen: string;
  issue: string;
};

/**
 * `value` spelled as a JavaScript literal.
 *
 * ```ts
 * emitLiteral('a') // '"a"'
 * emitLiteral(10n) // '10n'
 * emitLiteral(-0)  // '-0', which `String(-0)` would lose
 * ```
 */
export const emitLiteral = (value: PossibleLiteralValue): string => {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') {
    return `${value}n`;
  }
  return Object.is(value, -0) ? '-0' : String(value);
};

/**
 * An Issue as a plain object literal, importing nothing. The message goes
 * through `@pvl/schema`'s own `Issue`, so an empty custom message falls back
 * to its default exactly as the interpreted path's does.
 *
 * ```ts
 * emitIssue('TOO_SMALL', 'too short', '[...path, "name"]')
 * // '{ code: "TOO_SMALL", message: "too short", path: [...path, "name"] }'
 * ```
 */
export const emitIssue = (code: IssueCode, message: string, path: string): string => {
  const issueMessage = new Issue(code, [], message).message;
  return js`{ code: ${JSON.stringify(code)}, message: ${JSON.stringify(issueMessage)}, path: ${path} }`;
};
