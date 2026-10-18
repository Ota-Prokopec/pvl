// What every emitter shares: the `js` tag its templates are written with,
// how a check is written, the JavaScript fragments a `Frame` places around
// a Schema's checks, and how an Issue, a value and a literal's type are
// spelled in the emitted code. A fragment of a fixed shape, whose slots each
// hold a one-line expression, is written in a `js` template, as `js` would
// misindent a multi-line one; a block wrapping any statements is
// `Frame.composeBlock`'s, which keeps this module from importing the Frame
// that imports it.
import { Issue, type IssueCode, type PossibleLiteralValue } from '@pvl/schema';
import dedent from 'dedent';
import type {
  EmittingCheckMethodOutput,
  EmittingCheckMethodOutputWithCheck,
} from './emitterTypes.js';

/**
 * Tags a template holding emitted JavaScript, so it reads as code: the text
 * comes back as written, backslashes included, with the indentation its
 * lines share stripped and its surrounding whitespace trimmed. A block can
 * therefore be written across lines, indented as it sits in the source.
 *
 * ```ts
 * js`typeof ${'field0'} !== "string"` // 'typeof field0 !== "string"'
 * js`if (ok) {
 *      run();
 *    }`                               // 'if (ok) {\n  run();\n}'
 * ```
 */
export const js = dedent.withOptions({ escapeSpecialCharacters: false });

/**
 * What an emitter method wrote, as a statement: a check pushes its Issue onto
 * `issues` when it fails, and source text is a statement already.
 *
 * ```ts
 * emitCheck({ failsWhen: 'x < 3', issue: '{ … }' }) // 'if (x < 3) {\n  issues.push({ … });\n}'
 * emitCheck('for (const key of …) { … }')           // 'for (const key of …) { … }'
 * ```
 */
export const emitCheck = (check: EmittingCheckMethodOutput): string => {
  return typeof check === 'string'
    ? check
    : js`if (${check.failsWhen}) {
        issues.push(${check.issue});
      }`;
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

/**
 * `check` returning its Issue when it fails: the root's base check, after
 * which nothing else can be checked.
 *
 * ```ts
 * emitReturnIssueIfFails({ failsWhen: '!Array.isArray(value)', issue: '{ … }' })
 * // 'if (!Array.isArray(value)) {\n  issues.push({ … });\n  return { issues };\n}'
 * ```
 */
export const emitReturnIssueIfFails = ({
  failsWhen,
  issue,
}: EmittingCheckMethodOutputWithCheck): string => {
  return js`if (${failsWhen}) {
    issues.push(${issue});
    return { issues };
  }`;
};

/**
 * The statement returning `value` from `_checkType` as the value it
 * checked: the Result's `value` property, written in shorthand when the
 * expression is the identifier of the same name, `_checkType`'s own `value`.
 *
 * ```ts
 * emitReturnValue('value')  // 'return { value };'
 * emitReturnValue('output') // 'return { value: output };'
 * ```
 */
export const emitReturnValue = (value: string): string => {
  return value === 'value' ? 'return { value };' : js`return { value: ${value} };`;
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
export const emitNoNewIssuesCondition = (issueCount: string): string => {
  return js`issues.length === ${issueCount}`;
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

/**
 * A literal value's type. `-0` types as `0`, as TypeScript infers it.
 *
 * ```ts
 * spellLiteralType('a') // '"a"'
 * spellLiteralType(-0)  // '0'
 * spellLiteralType(10n) // '10n'
 * ```
 */
export const spellLiteralType = (literalValue: PossibleLiteralValue): string => {
  return typeof literalValue === 'number' ? String(literalValue) : emitLiteral(literalValue);
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
