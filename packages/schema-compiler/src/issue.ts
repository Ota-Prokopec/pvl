// How the emitted code reports an Issue: the Issue literal a failed check
// pushes onto `issues`, its message as a literal, as the field a Compiled
// Schema's constructor builds a message naming a Runtime Argument into, or as
// a template literal built around the default message's text, the Issue path
// of an Issue at the root, and the Gates a `Frame` places: the names of the
// Issue counts they compare with, and their condition.
import { upperFirst } from 'lodash-es';
import {
  replaceEmptyIssueMessage,
  type CheckOptions,
  type IssueCode,
  type IssueProps,
} from '@pvl/schema';
import type { EmittedIssue } from './emitters/types/emittedText.js';
import { js } from './emitters/utils/js.js';
import { RuntimeArgument } from './schemas/runtimeArgument.js';

// Stands in for a value only known at runtime while a default message is
// rendered, so the message's text around it can be split off and spelled in
// a template literal. It works for a message that writes its value as it is,
// as every `<SCHEMA>_SCHEMA_ISSUE_MESSAGE` does; the differential test
// catches one that formats it.
const MESSAGE_VALUE_PLACEHOLDER = '\u0000' as const;

/** What {@link emitIssueLiteral} writes an Issue literal from: its code, and its message and path, each as an expression. */
export type EmitIssueLiteralArgs = {
  code: IssueCode;
  message: string;
  path: string;
};

/**
 * An Issue literal, which a failed check pushes onto `issues`: the one place
 * an `EmittedIssue` is written.
 *
 * ```ts
 * emitIssueLiteral({ code: 'TOO_SMALL', message: 'this.arg0Message', path: '[...path1, "name"]' })
 * // '{ code: "TOO_SMALL", message: this.arg0Message, path: [...path1, "name"] }'
 * ```
 */
const emitIssueLiteral = ({ code, message, path }: EmitIssueLiteralArgs): EmittedIssue => {
  return js`{ code: ${JSON.stringify(code)}, message: ${message}, path: ${path} }` as EmittedIssue;
};

/**
 * What {@link emitIssue} writes an Issue literal from: the props of
 * `@pvl/schema`'s own Issue, its `path` as an expression.
 */
export type EmitIssueArgs = Omit<IssueProps, 'path'> & {
  /** The Issue's path, as an expression. */
  path: string;
};

/**
 * An Issue as a plain object literal, importing nothing, its message written
 * as a literal. The message goes through `@pvl/schema`'s own
 * `replaceEmptyIssueMessage`, so an empty custom message falls back exactly
 * as the interpreted path's does.
 *
 * ```ts
 * emitIssue({ code: 'TOO_SMALL', message: 'too short', path: '[...path1, "name"]' })
 * // '{ code: "TOO_SMALL", message: "too short", path: [...path1, "name"] }'
 * emitIssue({ code: 'TOO_SMALL', message: '', path: '[...path1, "name"]' })
 * // '{ code: "TOO_SMALL", message: "Invalid type", path: [...path1, "name"] }'
 * ```
 */
export const emitIssue = ({ code, message, path }: EmitIssueArgs): EmittedIssue => {
  return emitIssueLiteral({
    code,
    message: JSON.stringify(replaceEmptyIssueMessage(message)),
    path,
  });
};

/** What {@link emitConstraintIssue} writes an Issue literal from. */
export type EmitConstraintIssueArgs = {
  code: IssueCode;
  /** The Issue's path, as an expression. */
  path: string;
  /** The options of the check that reports it: as written, a Runtime Argument, or none. */
  options: CheckOptions | RuntimeArgument | undefined;
  /** Its default message, as an expression (`emitDefaultMessage`). */
  defaultMessage: string;
};

/**
 * The Issue a Constraint reports when it fails, as an object literal, with
 * its message decided as the interpreted path decides it: the options'
 * `message` when there is one, else the default, and `@pvl/schema`'s own
 * `replaceEmptyIssueMessage` for an empty one. A message written as a literal
 * is the literal; one a Runtime Argument decides is an expression the check
 * evaluates.
 *
 * ```ts
 * emitConstraintIssue({ code: 'TOO_SMALL', path: '[...path, "name"]', options: { message: 'short' }, defaultMessage })
 * // '{ code: "TOO_SMALL", message: "short", path: [...path, "name"] }'
 * emitConstraintIssue({ code: 'TOO_SMALL', path, options: undefined, defaultMessage: 'this.arg0Message' })
 * // '{ code: "TOO_SMALL", message: this.arg0Message, path: … }'
 * emitConstraintIssue({ code: 'TOO_SMALL', path, options: <the 2nd Runtime Argument>, defaultMessage: '"String must contain at least 3 character(s)"' })
 * // '{ code: "TOO_SMALL", message: (this.arg1?.message ?? "String must contain at least 3 character(s)") || "Invalid type", path: … }'
 * ```
 */
export const emitConstraintIssue = ({
  code,
  path,
  options,
  defaultMessage,
}: EmitConstraintIssueArgs): EmittedIssue => {
  if (!(options instanceof RuntimeArgument) && options?.message !== undefined) {
    return emitIssue({ code, message: options.message, path });
  }
  // A message a Runtime Argument decides is only known when the check runs,
  // and the emitted code imports nothing, so `||` mirrors
  // `replaceEmptyIssueMessage` there, with the text it replaces an empty one
  // with. The differential test's empty Runtime Argument message keeps the
  // two in step.
  const message =
    options instanceof RuntimeArgument
      ? `(${options.emitReading()}?.message ?? ${defaultMessage}) || ${JSON.stringify(replaceEmptyIssueMessage(''))}`
      : defaultMessage;
  return emitIssueLiteral({ code, message, path });
};

/**
 * A default message from `messageOf`, one of `<SCHEMA>_SCHEMA_ISSUE_MESSAGE`'s
 * functions, as an expression: a literal for a value written as one, or, for
 * a Runtime Argument, the field its Compiled Schema's constructor builds the
 * message into. The constructor builds it from its emitter's
 * `argumentMessages`, so `messageOf` must be read from there.
 *
 * ```ts
 * emitDefaultMessage(StringSchemaEmitter.argumentMessages.min, 3)                          // '"String must contain at least 3 character(s)"'
 * emitDefaultMessage(StringSchemaEmitter.argumentMessages.min, <the 1st Runtime Argument>) // 'this.arg0Message'
 * emitDefaultMessage(NUMBER_SCHEMA_ISSUE_MESSAGE.int)                             // '"Number must be an integer"'
 * ```
 */
export const emitDefaultMessage = <TValue>(
  messageOf: (value: TValue) => string,
  value?: TValue | RuntimeArgument,
): string => {
  return value instanceof RuntimeArgument
    ? value.emitMessageReading()
    : JSON.stringify(messageOf(value as TValue));
};

/**
 * A default message from `messageOf` naming a value only known at runtime,
 * `valueExpression`, as a template literal holding the message's text around
 * it, which writes the value as `@pvl/schema`'s own template literal does.
 *
 * ```ts
 * emitMessageAroundValue(OBJECT_SCHEMA_ISSUE_MESSAGE.strict, 'key')  // '`Unrecognized key "${key}"`'
 * emitMessageAroundValue(STRING_SCHEMA_ISSUE_MESSAGE.max, 'arg0')    // '`String must contain at most ${arg0} character(s)`'
 * emitMessageAroundValue(NUMBER_SCHEMA_ISSUE_MESSAGE.min, 'arg0')    // '`Number must be greater than or equal to ${arg0}`'
 * ```
 */
export const emitMessageAroundValue = <TValue>(
  messageOf: (value: TValue) => string,
  valueExpression: string,
): string => {
  const escapedTexts = messageOf(MESSAGE_VALUE_PLACEHOLDER as unknown as TValue)
    .split(MESSAGE_VALUE_PLACEHOLDER)
    .map((text) => text.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${'));
  return `\`${escapedTexts.join(`\${${valueExpression}}`)}\``;
};

/**
 * The Issue path of an Issue about a Compiled Schema's root value, at
 * `_validate`'s `path` parameter: `undefined` when it is empty, as
 * `@pvl/schema`'s own `Issue` makes it.
 *
 * ```ts
 * emitRootIssuePath('path') // 'path.length > 0 ? path : undefined'
 * ```
 */
export const emitRootIssuePath = (pathVariableName: string): string => {
  return js`${pathVariableName}.length > 0 ? ${pathVariableName} : undefined`;
};

/**
 * The name of the local holding the count of Issues taken before `value`'s
 * validation, which its transform's Gate compares with. It is named after
 * the value, which is unique in its Compiled Schema, so no two clash.
 *
 * ```ts
 * emitIssueCountBeforeValueValidationName('field0') // 'issueCountBeforeField0Validation'
 * ```
 */
export const emitIssueCountBeforeValueValidationName = (value: string): string => {
  return js`issueCountBefore${upperFirst(value)}Validation`;
};

/**
 * The name of the local holding the count of Issues taken before the
 * validation of `value`'s children, which its post-modifiers' Gate compares
 * with. It is named after the composite's value, as its transform's is,
 * with a suffix of its own, so the two never clash.
 *
 * ```ts
 * emitIssueCountBeforeValueChildrenValidationName('field0') // 'issueCountBeforeField0ChildrenValidation'
 * ```
 */
export const emitIssueCountBeforeValueChildrenValidationName = (value: string): string => {
  return js`issueCountBefore${upperFirst(value)}ChildrenValidation`;
};

/**
 * A Gate's condition: no Issue was added since the count of Issues held in
 * `issueCountVariableName` was taken.
 *
 * ```ts
 * emitNoNewIssuesCondition('issueCountBeforeField0Validation') // 'issues.length === issueCountBeforeField0Validation'
 * ```
 */
export const emitNoNewIssuesCondition = (issueCountVariableName: string): string => {
  return js`issues.length === ${issueCountVariableName}`;
};
