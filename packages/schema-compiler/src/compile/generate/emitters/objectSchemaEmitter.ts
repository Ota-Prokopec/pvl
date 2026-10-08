// The code an `ObjectSchema` compiles to, one static method per method of
// `ObjectSchema` it mirrors. The per-field checks themselves are written by
// emitCompiledSchema.ts, which inlines them into the object's body, where
// `input`, `output` and `issues` are in scope.
import { ISSUE_CODE, OBJECT_SCHEMA_ISSUE_MESSAGE, type IssueEditableProps } from '@pvl/schema';
import { emitIssue, js, type EmitTarget, type EmittedCheck } from './utils.js';

/** An object's target, plus the keys its shape declares. */
export type ObjectEmitTarget = EmitTarget & {
  declaredKeys: ReadonlyArray<string>;
};

// Stands in for the unknown key while the default message is rendered, so
// the message's text around it can be split off and spelled as literals.
const KEY_PLACEHOLDER = '\u0000' as const;

// The condition under which the runtime `key` isn't one the shape declares.
//
//   ['name', 'age'] // 'key !== "name" && key !== "age"'
//   []              // 'true'
const emitIsUndeclaredKey = (declaredKeys: ReadonlyArray<string>): string => {
  return declaredKeys.length === 0
    ? 'true'
    : declaredKeys.map((declaredKey) => js`key !== ${JSON.stringify(declaredKey)}`).join(' && ');
};

// The UNRECOGNIZED_KEY Issue for the runtime `key`. Its default message names
// the key, so it is built at runtime around the literal text of
// `OBJECT_SCHEMA_ISSUE_MESSAGE.strict`.
//
//   { code: "UNRECOGNIZED_KEY", message: "Unrecognized key \"" + key + "\"", path: [...path, key] }
const emitUnrecognizedKeyIssue = (path: string, options?: IssueEditableProps): string => {
  const issuePath = js`[...${path}, key]`;
  if (options?.message !== undefined) {
    return emitIssue(ISSUE_CODE.UNRECOGNIZED_KEY, options.message, issuePath);
  }
  const message = OBJECT_SCHEMA_ISSUE_MESSAGE.strict(KEY_PLACEHOLDER)
    .split(KEY_PLACEHOLDER)
    .map((text) => JSON.stringify(text))
    .join(' + key + ');
  return js`{ code: ${JSON.stringify(ISSUE_CODE.UNRECOGNIZED_KEY)}, message: ${message}, path: ${issuePath} }`;
};

export class ObjectSchemaEmitter {
  /** `typeof value !== "object" || value === null || Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static _checkType({ value, path }: EmitTarget): EmittedCheck {
    return {
      failsWhen: js`typeof ${value} !== "object" || ${value} === null || Array.isArray(${value})`,
      issue: emitIssue(ISSUE_CODE.INVALID_TYPE, OBJECT_SCHEMA_ISSUE_MESSAGE._checkType(), path),
    };
  }

  /**
   * `.strict()`: an `UNRECOGNIZED_KEY` Issue per key of `input` the shape
   * doesn't declare.
   *
   * ```ts
   * for (const key of Object.keys(input)) {
   *   if (key !== "name") {
   *     issues.push({ code: "UNRECOGNIZED_KEY", message: "Unrecognized key \"" + key + "\"", path: [...path, key] });
   *   }
   * }
   * ```
   */
  public static strict(
    { path, declaredKeys }: ObjectEmitTarget,
    options?: IssueEditableProps,
  ): string {
    return [
      js`for (const key of Object.keys(input)) {`,
      js`  if (${emitIsUndeclaredKey(declaredKeys)}) {`,
      js`    issues.push(${emitUnrecognizedKeyIssue(path, options)});`,
      js`  }`,
      js`}`,
    ].join('\n');
  }

  /**
   * `.passthrough()`: copies every key of `input` the shape doesn't declare
   * onto `output`, after the declared ones. `__proto__` is defined rather
   * than assigned, which would reparent `output` instead.
   */
  public static passthrough({ declaredKeys }: ObjectEmitTarget): string {
    return [
      js`for (const key of Object.keys(input)) {`,
      js`  if (${emitIsUndeclaredKey(declaredKeys)}) {`,
      js`    if (key === "__proto__") {`,
      js`      Object.defineProperty(output, key, { value: input[key], writable: true, enumerable: true, configurable: true });`,
      js`    } else {`,
      js`      output[key] = input[key];`,
      js`    }`,
      js`  }`,
      js`}`,
    ].join('\n');
  }
}
