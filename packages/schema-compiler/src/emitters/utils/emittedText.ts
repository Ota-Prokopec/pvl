// The one function writing each kind of emitted text (ADR-0033): a check, a
// base check, a short-circuit condition, a coercion, a transform, an output
// statement and a declaration. An Issue's is in `../../issue.ts`.
import { ISSUE_CODE, type IssueProps } from '@pvl/schema';
import { emitIssue } from '../../issue.js';
import type {
  EmittedCheck,
  EmittedCoercion,
  EmittedIssue,
  EmittedOutputStatement,
  EmittedShortCircuitCondition,
  EmittedTransform,
  EmittedVariableDeclaration,
} from '../types/emittedText.js';
import { js } from './js.js';

/** What {@link emitCheck} writes a check from: the condition it fails under, the Issue it reports then, and the loop it runs in, if any. */
type EmitCheckArgs = {
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

/** What {@link emitTypeCheck} writes a base check from: the condition it fails under, its message, the Issue path it reports at, and its code. */
type EmitTypeCheckArgs = Omit<IssueProps, 'code' | 'path'> & {
  failsWhen: string;
  /** The Issue's path, as an expression: the target's `issuePath`. */
  issuePath: string;
  /** `INVALID_TYPE` unless the check compares the value to fixed values, as `pvl.literal` and `pvl.enum`'s report `INVALID_VALUE`. */
  issueCode?: IssueProps['code'];
};

/**
 * A base check, as every `_emitBaseCheck` writes it: a check that pushes
 * an Issue of `issueCode` with `message` at `issuePath` when `failsWhen` holds.
 * Named after the `_checkType` it compiles, which every interpreted Schema
 * names its base check, a literal's and an enum's value check included.
 *
 * ```ts
 * emitTypeCheck({ failsWhen: 'typeof field0 !== "string"', message: 'Expected string', issuePath: '[...path1, "name"]' })
 * // 'if (typeof field0 !== "string") {\n  issues.push({ code: "INVALID_TYPE", message: "Expected string", path: [...path1, "name"] });\n}'
 * ```
 */
export const emitTypeCheck = ({
  failsWhen,
  message,
  issuePath,
  issueCode = ISSUE_CODE.INVALID_TYPE,
}: EmitTypeCheckArgs): EmittedCheck => {
  return emitCheck({
    failsWhen,
    issue: emitIssue({ code: issueCode, message, path: issuePath }),
  });
};

/** What {@link emitShortCircuitCondition} writes a pre-modifier's condition from: the condition, as an expression, under which it accepts the value. */
type EmitShortCircuitConditionArgs = {
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

/** What {@link emitCoercion} writes `.coerce()`'s conversion from: the statements replacing the value. */
type EmitCoercionArgs = {
  statement: string;
};

/**
 * `.coerce()`'s conversion, as statements replacing the value before its
 * type check. The one place an `EmittedCoercion` is written.
 *
 * ```ts
 * emitCoercion({ statement: 'field0 = String(field0);' }) // 'field0 = String(field0);'
 * ```
 */
export const emitCoercion = ({ statement }: EmitCoercionArgs): EmittedCoercion => {
  return statement as EmittedCoercion;
};

/** What {@link emitTransform} writes `.transform()`'s call from: the statement replacing the value. */
type EmitTransformArgs = {
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
type EmitOutputStatementArgs = {
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
type EmitVariableDeclarationArgs = {
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
