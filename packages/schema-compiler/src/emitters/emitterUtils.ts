// What every emitter shares: the `js` tag its templates are written with,
// how a check is written, and how a value, a Runtime Argument and a
// literal's type are spelled in the emitted code (an Issue's are in
// `../issue.ts`). A fragment of a fixed shape, whose slots each
// hold a one-line expression, is written in a `js` template, as `js` would
// misindent a multi-line one; a block wrapping any statements is
// `Frame.composeBlock`'s.
import type { PossibleLiteralValue } from '@pvl/schema';
import dedent from 'dedent';
import { RuntimeArgument } from '../schemas/runtimeArgument.js';
import type { EmittedCheck, EmittedIssue } from './emittersTypes.js';

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

/** What {@link emitCheck} writes a check from: the condition it fails under, and the Issue it reports then. */
export type EmitCheckArgs = {
  failsWhen: string;
  issue: EmittedIssue;
};

/**
 * A check as a statement, which pushes its Issue onto `issues` when it
 * fails: how a base check and a Constraint are written.
 *
 * ```ts
 * emitCheck({ failsWhen: 'x < 3', issue: '{ … }' }) // 'if (x < 3) {\n  issues.push({ … });\n}'
 * ```
 */
export const emitCheck = ({ failsWhen, issue }: EmitCheckArgs): EmittedCheck => {
  return js`if (${failsWhen}) {
    issues.push(${issue});
  }` as EmittedCheck;
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
 * A method's argument as the emitted code reads it: a literal written as
 * one, a Runtime Argument off the Compiled Schema's instance.
 *
 * ```ts
 * emitArgument(3)                       // '3'
 * emitArgument(10n)                     // '10n'
 * emitArgument(<the 1st Runtime Argument>) // 'this.arg0'
 * ```
 */
export const emitArgument = (argument: PossibleLiteralValue | RuntimeArgument): string => {
  return argument instanceof RuntimeArgument ? argument.emitReading() : emitLiteral(argument);
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
