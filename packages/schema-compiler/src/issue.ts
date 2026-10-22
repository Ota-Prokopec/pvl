// How the emitted code reports an Issue: the Issue literal a failed check
// pushes onto `issues`, its message as a literal, as the field a Compiled
// Schema's constructor builds a message naming a Runtime Argument into, or as
// a template literal built around the default message's text, the Issue path
// of an Issue at the root, and the condition a `Frame` gates a composite's
// post-modifiers behind.
import { Issue, type IssueCode, type IssueEditableProps } from '@pvl/schema';
import { js } from './emitters/emitterUtils.js';
import type { EmittedIssue } from './emitters/emittersTypes.js';
import { RuntimeArgument } from './schemas/runtimeArgument.js';

// Stands in for a value only known at runtime while a default message is
// rendered, so the message's text around it can be split off and spelled in
// a template literal. It works for a message that writes its value as it is,
// as every `<SCHEMA>_SCHEMA_ISSUE_MESSAGE` does; the differential test
// catches one that formats it.
const MESSAGE_VALUE_PLACEHOLDER = '\u0000' as const;

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
export const emitIssue = (issue: Issue): EmittedIssue => {
  return js`{ code: ${JSON.stringify(issue.code)}, message: ${JSON.stringify(issue.message)}, path: ${issue.path} }` as EmittedIssue;
};

/** What {@link emitConstraintIssue} writes an Issue literal from. */
export type EmitConstraintIssueArgs = {
  code: IssueCode;
  /** The Issue's path, as an expression. */
  issuePath: string;
  /** The Issue options of the method that reports it: as written, a Runtime Argument, or none. */
  options: IssueEditableProps | RuntimeArgument | undefined;
  /** Its default message, as an expression (`emitDefaultMessage`). */
  defaultMessage: string;
};

/**
 * The Issue a Constraint reports when it fails, as an object literal, with
 * its message decided as the interpreted path decides it: the options'
 * `message` when there is one, else the default, and `@pvl/schema`'s own
 * fallback for an empty one. A message written as a literal is the literal;
 * one a Runtime Argument decides is an expression the check evaluates.
 *
 * ```ts
 * emitConstraintIssue({ code: 'TOO_SMALL', issuePath: '[...path, "name"]', options: { message: 'short' }, defaultMessage })
 * // '{ code: "TOO_SMALL", message: "short", path: [...path, "name"] }'
 * emitConstraintIssue({ code: 'TOO_SMALL', issuePath, options: undefined, defaultMessage: 'this.arg0Message' })
 * // '{ code: "TOO_SMALL", message: this.arg0Message, path: … }'
 * emitConstraintIssue({ code: 'TOO_SMALL', issuePath, options: <the 2nd Runtime Argument>, defaultMessage: '"String must contain at least 3 character(s)"' })
 * // '{ code: "TOO_SMALL", message: (this.arg1?.message ?? "String must contain at least 3 character(s)") || "Invalid type", path: … }'
 * ```
 */
export const emitConstraintIssue = ({
  code,
  issuePath,
  options,
  defaultMessage,
}: EmitConstraintIssueArgs): EmittedIssue => {
  if (!(options instanceof RuntimeArgument) && options?.message !== undefined) {
    return emitIssue(new Issue(code, [issuePath], options.message));
  }
  const message =
    options instanceof RuntimeArgument
      ? `(${options.emitReading()}?.message ?? ${defaultMessage}) || ${JSON.stringify(new Issue(code, []).message)}`
      : defaultMessage;
  return js`{ code: ${JSON.stringify(code)}, message: ${message}, path: ${issuePath} }` as EmittedIssue;
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
 * The condition under which no Issue was added since `issueCount`, the
 * local holding the count of Issues taken before a composite's children:
 * every child passed.
 *
 * ```ts
 * emitNoNewIssuesCondition('issueCount1') // 'issues.length === issueCount1'
 * ```
 */
export const emitNoNewIssuesCondition = (issueCountVariableName: string): string => {
  return js`issues.length === ${issueCountVariableName}`;
};
