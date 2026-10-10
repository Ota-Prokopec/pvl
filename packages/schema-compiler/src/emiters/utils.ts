// What every emitter shares: the `js` tag its templates are written with,
// the shapes it hands back, and how an Issue, a value and a literal's type are
// spelled in the emitted code.
import { Issue, type IssueCode, type PossibleLiteralValue } from '@pvl/schema';
import dedent from 'dedent';

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

/** A Schema's `Input` and `Output` types, spelled as TypeScript. */
export type SchemaTypes = {
  input: string;
  output: string;
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
