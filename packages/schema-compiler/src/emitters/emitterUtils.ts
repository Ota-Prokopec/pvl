// What every emitter shares: the `js` tag its templates are written with,
// the one function writing each kind of emitted text (a check, a
// short-circuit condition, an output statement, a declaration; an Issue's is
// in `../issue.ts`), a chained method's arguments as its emitter method
// takes them, and how a value, a Runtime Argument and a literal's type are
// spelled in the emitted code. A fragment of a fixed shape, whose slots each
// hold a one-line expression, is written in a `js` template, as `js` would
// misindent a multi-line one; a block wrapping any statements is written
// with `composeBlock`, which indents them.
import type { PossibleLiteralValue } from '@pvl/schema';
import dedent from 'dedent';
import { RuntimeArgument } from '../schemas/runtimeArgument.js';
import type { SchemaModifierCall } from '../schemas/schemaTypes.js';
import type {
  EmittedCheck,
  EmittedCoercion,
  EmittedIssue,
  EmittedOutputStatement,
  EmittedShortCircuitCondition,
  EmittedTransform,
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

/** What {@link composeBlock} writes a block from: what precedes its braces, and the statements they wrap. */
export type ComposeBlockArgs = {
  /** What precedes the braces: `if (ok)`, `for (const key of Object.keys(input1))`, a base check and its `else`. */
  head: string;
  /** The statements, on one line or several. */
  body: string;
};

/**
 * A block: `head`, then `body` inside braces, every line of it indented one
 * level, so a multi-line `body` (another block, a list of checks) keeps its
 * own indentation beneath it. An empty line stays empty.
 *
 * ```ts
 * composeBlock({ head: 'if (ok)', body: 'run();\n\nstop();' }) // 'if (ok) {\n  run();\n\n  stop();\n}'
 * ```
 */
export const composeBlock = ({ head, body }: ComposeBlockArgs): string => {
  const indentedBody = body
    .split('\n')
    .map((line) => (line === '' ? line : `  ${line}`))
    .join('\n');
  return `${head} {\n${indentedBody}\n}`;
};

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

/** What {@link emitCoercion} writes `.coerce()`'s conversion from: the statements replacing the value, none for the identity. */
export type EmitCoercionArgs = {
  statement: string;
};

/**
 * `.coerce()`'s conversion, as statements replacing the value before its
 * type check, or `''` where `@pvl/schema`'s `_coerceInput` is the identity.
 * The one place an `EmittedCoercion` is written.
 *
 * ```ts
 * emitCoercion({ statement: 'field0 = String(field0);' }) // 'field0 = String(field0);'
 * ```
 */
export const emitCoercion = ({ statement }: EmitCoercionArgs): EmittedCoercion => {
  return statement as EmittedCoercion;
};

/** What {@link emitTransform} writes `.transform()`'s call from: the statement replacing the value. */
export type EmitTransformArgs = {
  statement: string;
};

/**
 * `.transform()`'s call, as a statement replacing the value with what the
 * user's function returns. The one place an `EmittedTransform` is written.
 *
 * ```ts
 * emitTransform({ statement: 'field0 = this.arg0.call(undefined, field0 as never);' }) // 'field0 = this.arg0.call(undefined, field0 as never);'
 * ```
 */
export const emitTransform = ({ statement }: EmitTransformArgs): EmittedTransform => {
  return statement as EmittedTransform;
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
 * A call to a function the user passed a method, `.refine()`'s predicate or
 * `.transform()`'s function, on `value`, read off the Compiled Schema's
 * instance (`readFunctionArgument`) and called with no `this`, as the
 * interpreted path calls it, so a `function` never sees the instance. Its
 * constructor types the function's parameter as the
 * interpreted Schema does at that point of its chain, but `value` may be
 * typed otherwise where it is read (a literal's check doesn't narrow it, a
 * composite's output is a record), so it is passed as `never`: the
 * compiler checks syntax, not types (ADR-0024).
 *
 * ```ts
 * emitFunctionCall(<the 1st Runtime Argument>, 'field0') // 'this.arg0.call(undefined, field0 as never)'
 * ```
 */
export const emitFunctionCall = (fn: unknown, value: string): string => {
  return js`${readFunctionArgument(fn).emitReading()}.call(undefined, ${value} as never)`;
};

/**
 * A function the user passed a method, `.refine()`'s predicate or
 * `.transform()`'s function, as the Runtime Argument it always is, as it is
 * never a literal; anything else is a bug in the compiler, never a user
 * error, which throws.
 *
 * ```ts
 * readFunctionArgument(<the 1st Runtime Argument>) // <the 1st Runtime Argument>
 * readFunctionArgument(3)                          // throws
 * ```
 */
export const readFunctionArgument = (fn: unknown): RuntimeArgument => {
  if (!(fn instanceof RuntimeArgument)) {
    throw new Error(`A function passed a method is always a Runtime Argument, not ${String(fn)}.`);
  }
  return fn;
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
