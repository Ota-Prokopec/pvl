// What every emitter shares: the `js` tag its templates are written with,
// the one function writing each kind of emitted text (a check, a
// short-circuit condition, an output statement, a declaration; an Issue's is
// in `../issue.ts`), a chained method's arguments as its emitter method
// takes them, and how a value, a Runtime Argument and a literal's type are
// spelled in the emitted code. A fragment of a fixed shape, whose slots each
// hold a one-line expression, is written in a `js` template, as `js` would
// misindent a multi-line one; a block wrapping any statements is
// `Frame.composeBlock`'s.
import type { PossibleLiteralValue } from '@pvl/schema';
import dedent from 'dedent';
import { RuntimeArgument } from '../schemas/runtimeArgument.js';
import type { SchemaModifierCall } from '../schemas/schemaTypes.js';
import type {
  EmittedCheck,
  EmittedIssue,
  EmittedOutputStatement,
  EmittedShortCircuitCondition,
  EmittedVariableDeclaration,
} from './emittersTypes.js';

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

/** What {@link emitCheck} writes a check from: the condition it fails under, the Issue it reports then, and the loop it runs in, if any. */
export type EmitCheckArgs = {
  failsWhen: string;
  issue: EmittedIssue;
  /** The head of a loop the check runs once per iteration of, as `.strict()` checks each key: `for (const key of Object.keys(input1))`. */
  loopHead?: string;
};

/**
 * A check as a statement, which pushes its Issue onto `issues` when it
 * fails, or, with `loopHead`, each time it fails in the loop: how a base
 * check and a Constraint are written, and the one place an `EmittedCheck`
 * is.
 *
 * ```ts
 * emitCheck({ failsWhen: 'x < 3', issue: '{ … }' }) // 'if (x < 3) {\n  issues.push({ … });\n}'
 * emitCheck({ failsWhen: 'key !== "a"', issue: '{ … }', loopHead: 'for (const key of Object.keys(input1))' })
 * // 'for (const key of Object.keys(input1)) {\n  if (key !== "a") {\n    issues.push({ … });\n  }\n}'
 * ```
 */
export const emitCheck = ({ failsWhen, issue, loopHead }: EmitCheckArgs): EmittedCheck => {
  const check =
    loopHead === undefined
      ? js`if (${failsWhen}) {
          issues.push(${issue});
        }`
      : js`${loopHead} {
          if (${failsWhen}) {
            issues.push(${issue});
          }
        }`;
  return check as EmittedCheck;
};

/** What {@link emitShortCircuitCondition} writes a pre-modifier's condition from: the condition, as an expression, under which it accepts the value. */
export type EmitShortCircuitConditionArgs = {
  acceptsWhen: string;
};

/**
 * A pre-modifier's short-circuit condition, as an expression: a value it
 * holds for is one the pre-modifier accepts, which skips every other check.
 * The one place an `EmittedShortCircuitCondition` is written.
 *
 * ```ts
 * emitShortCircuitCondition({ acceptsWhen: 'field0 === undefined' }) // 'field0 === undefined'
 * ```
 */
export const emitShortCircuitCondition = ({
  acceptsWhen,
}: EmitShortCircuitConditionArgs): EmittedShortCircuitCondition => {
  return acceptsWhen as EmittedShortCircuitCondition;
};

/** What {@link emitOutputStatement} writes a statement building a composite's output from: the statement. */
export type EmitOutputStatementArgs = {
  statement: string;
};

/**
 * A statement building a composite's output, which its Frame places after
 * its checks. The one place an `EmittedOutputStatement` is written.
 *
 * ```ts
 * emitOutputStatement({ statement: 'output1["name"] = field0;' }) // 'output1["name"] = field0;'
 * ```
 */
export const emitOutputStatement = ({
  statement,
}: EmitOutputStatementArgs): EmittedOutputStatement => {
  return statement as EmittedOutputStatement;
};

/** What {@link emitVariableDeclaration} declares a composite's local from: its name, its type, if it isn't left inferred, and the expression it is initialized with. */
export type EmitVariableDeclarationArgs = {
  name: string;
  type?: string;
  initializer: string;
};

/**
 * A `const` a composite declares among its own locals, which its Frame
 * places after its path and Issue-count locals. The one place an
 * `EmittedVariableDeclaration` is written.
 *
 * ```ts
 * emitVariableDeclaration({ name: 'output2', type: 'unknown[]', initializer: '[]' })                       // 'const output2: unknown[] = [];'
 * emitVariableDeclaration({ name: 'input1', initializer: 'value as Record<string, unknown>' }) // 'const input1 = value as Record<string, unknown>;'
 * ```
 */
export const emitVariableDeclaration = ({
  name,
  type,
  initializer,
}: EmitVariableDeclarationArgs): EmittedVariableDeclaration => {
  const typeAnnotation = type === undefined ? '' : `: ${type}`;
  return js`const ${name}${typeAnnotation} = ${initializer};` as EmittedVariableDeclaration;
};

/**
 * `call`'s arguments, as the emitter method of its name takes them. The
 * compiler reads syntax, not types (ADR-0024), so it trusts them to be what
 * that method's parameters declare, as the application's own type check
 * holds them to be: typed `never`, they can be passed as any method's
 * `args`. The one place a call's arguments are handed to an emitter method. Only called on a
 * Schema `Schema.findUncompilableDiagnostics` found nothing in, so none is
 * spread.
 *
 * ```ts
 * readCallArguments(<.min(3, { message: 'short' })>) // [3, { message: 'short' }]
 * readCallArguments(<.optional()>)                  // []
 * ```
 */
export const readCallArguments = (call: SchemaModifierCall): never => {
  return (call.args ?? []) as never;
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
