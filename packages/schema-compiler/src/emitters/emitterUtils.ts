// What every emitter shares: the `js` tag its templates are written with,
// how a check is written, the return of a checked value a `Frame` places
// after a Schema's checks, and how a value and a literal's type are spelled
// in the emitted code (an Issue's are in `../issue.ts`). A fragment of a fixed shape, whose slots each
// hold a one-line expression, is written in a `js` template, as `js` would
// misindent a multi-line one; a block wrapping any statements is
// `Frame.composeBlock`'s, which keeps this module from importing the Frame
// that imports it.
import type { PossibleLiteralValue } from '@pvl/schema';
import dedent from 'dedent';
import type { EmittedCheck } from '../types.js';
import type { Check } from './emitterTypes.js';

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
export const emitCheck = (check: Check | string): EmittedCheck => {
  return (
    typeof check === 'string'
      ? check
      : js`if (${check.failsWhen}) {
          issues.push(${check.issue});
        }`
  ) as EmittedCheck;
};

/**
 * The statement returning `value` from `_checkType` as the value it
 * checked: the Result's `value` property.
 *
 * ```ts
 * emitReturnValue('value')  // 'return { value: value };'
 * emitReturnValue('output') // 'return { value: output };'
 * ```
 */
export const emitReturnValue = (value: string): string => {
  return js`return { value: ${value} };`;
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
