// The code an `ObjectSchema` compiles to, one static method per method of
// `ObjectSchema` it mirrors, and the body of a compiled object's
// `_checkType`, which inlines every field's checks where `input`, `output`
// and `issues` are in scope.
import { ISSUE_CODE, OBJECT_SCHEMA_ISSUE_MESSAGE, type IssueEditableProps } from '@pvl/schema';
import { ROOT_ISSUE_PATH } from '../consts.js';
import { SCHEMA_FACTORY } from '../enums.js';
import type { SchemaMethodCall, SchemaModel } from '../schemaModel.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { findFlatEmitter } from './flatEmitters.js';
import { emitIssue, js, type EmitTarget, type EmittedCheck, type SchemaTypes } from './utils.js';

// A key that reads bare in a comment or a type.
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

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

/**
 * The UNRECOGNIZED_KEY Issue for the runtime `key`. Its default message names
 * the key, so it is built at runtime around the literal text of
 * `OBJECT_SCHEMA_ISSUE_MESSAGE.strict`.
 *
 * ```ts
 * { code: "UNRECOGNIZED_KEY", message: "Unrecognized key \"" + key + "\"", path: [...path, key] }
 * ```
 */
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

/**
 * How a key reads in a comment or a type: bare when it is an identifier,
 * quoted otherwise.
 *
 * ```ts
 * formatKey('name')   // 'name'
 * formatKey('e-mail') // '"e-mail"'
 * ```
 */
const formatKey = (key: string): string => {
  return IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
};

/**
 * An object type from its fields, each key already marked `?` when optional.
 *
 * ```ts
 * spellObjectType([{ key: 'name', type: 'string' }, { key: 'age?', type: 'number | undefined' }])
 * // '{ name: string; age?: number | undefined }'
 * spellObjectType([]) // '{}'
 * ```
 */
const spellObjectType = (fields: ReadonlyArray<{ key: string; type: string }>): string => {
  return fields.length === 0
    ? '{}'
    : `{ ${fields.map(({ key, type }) => `${key}: ${type}`).join('; ')} }`;
};

/**
 * Whether a field's Schema may be `undefined`, as it is `.optional()`.
 *
 * ```ts
 * isOptionalField(<pvl.string().optional()>) // true
 * isOptionalField(<pvl.string()>)            // false
 * ```
 */
const isOptionalField = (fieldSchema: SchemaModel): boolean => {
  return fieldSchema.calls.some((call) => call.name === 'optional');
};

/**
 * The last of `.strict()` and `.passthrough()` chained onto an object, which
 * wins, since each removes the other; `undefined` means it strips.
 *
 * ```ts
 * findUnknownKeysCall([strict(), passthrough()]) // passthrough()
 * findUnknownKeysCall([])                        // undefined
 * ```
 */
const findUnknownKeysCall = (
  calls: ReadonlyArray<SchemaMethodCall>,
): SchemaMethodCall | undefined => {
  return [...calls].reverse().find((call) => call.name === 'strict' || call.name === 'passthrough');
};

export class ObjectSchemaEmitter extends ChainableSchemaEmitter {
  /** `typeof value !== "object" || value === null || Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static override _checkType({ value, path }: EmitTarget): EmittedCheck {
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
    return js`for (const key of Object.keys(input)) {
      if (${emitIsUndeclaredKey(declaredKeys)}) {
        issues.push(${emitUnrecognizedKeyIssue(path, options)});
      }
    }`;
  }

  /**
   * `.passthrough()`: copies every key of `input` the shape doesn't declare
   * onto `output`, after the declared ones. `__proto__` is defined rather
   * than assigned, which would reparent `output` instead.
   */
  public static passthrough({ declaredKeys }: ObjectEmitTarget): string {
    return js`for (const key of Object.keys(input)) {
      if (${emitIsUndeclaredKey(declaredKeys)}) {
        if (key === "__proto__") {
          Object.defineProperty(output, key, { value: input[key], writable: true, enumerable: true, configurable: true });
        } else {
          output[key] = input[key];
        }
      }
    }`;
  }

  /**
   * The body of a compiled object's `_checkType`: the type check, every
   * field's checks inlined in shape order, then the unknown-keys handling the
   * last of `.strict()`/`.passthrough()` chose (stripping when neither was
   * chained), then the output built from the fields that passed.
   */
  public static override _emitBody(schema: SchemaModel): string {
    if (schema.factory !== SCHEMA_FACTORY.OBJECT) {
      throw new Error(`ObjectSchemaEmitter can't emit a pvl.${schema.factory}().`);
    }
    const rootTarget: EmitTarget = { value: 'value', path: ROOT_ISSUE_PATH };
    const declaredKeys = schema.shape.map(({ key }) => key);
    const objectTarget: ObjectEmitTarget = { value: 'input', path: 'path', declaredKeys };
    const unknownKeysCall = findUnknownKeysCall(schema.calls);

    const fieldChecks = schema.shape.map(({ key, schema: fieldSchema }, index) => {
      const value = `field${String(index)}`;
      return [
        `// ${formatKey(key)}`,
        js`const ${value} = input[${JSON.stringify(key)}];`,
        findFlatEmitter(fieldSchema)._emitChecks(fieldSchema, {
          value,
          path: js`[...path, ${JSON.stringify(key)}]`,
        }),
        '',
      ].join('\n');
    });
    const strictChecks =
      unknownKeysCall?.name === 'strict'
        ? [this.emitCallText(unknownKeysCall, objectTarget), this.emitReturnIssuesIfAny()]
        : [];
    const outputAssignments = schema.shape.map(({ key, schema: fieldSchema }, index) =>
      this._emitOutputAssignment(key, fieldSchema, `field${String(index)}`),
    );
    const passthroughCopy =
      unknownKeysCall?.name === 'passthrough'
        ? [this.emitCallText(unknownKeysCall, objectTarget)]
        : [];

    return [
      'const issues: PvlIssue[] = [];',
      this.emitReturnIssueIfFails(this._checkType(rootTarget)),
      'const input = value as Record<string, unknown>;',
      '',
      ...fieldChecks,
      this.emitReturnIssuesIfAny(),
      ...strictChecks,
      'const output: Record<string, unknown> = {};',
      ...outputAssignments,
      ...passthroughCopy,
      'return { value: output };',
    ].join('\n');
  }

  /**
   * An object type of the fields' types, an optional field's key marked `?`.
   * `.passthrough()` widens the output for good, even under a later
   * `.strict()`, as `ObjectSchema`'s own types do.
   *
   * ```ts
   * ObjectSchemaEmitter._spellTypes(<pvl.object({ name: pvl.string(), age: pvl.number().optional() })>)
   * // { input: '{ name: string; age?: number | undefined }', output: <the same> }
   * ```
   */
  public static override _spellTypes(schema: SchemaModel): SchemaTypes {
    if (schema.factory !== SCHEMA_FACTORY.OBJECT) {
      throw new Error(`ObjectSchemaEmitter can't spell a pvl.${schema.factory}().`);
    }
    const fields = schema.shape.map(({ key, schema: fieldSchema }) => {
      const { input, output } = findFlatEmitter(fieldSchema)._emitTypes(fieldSchema);
      return { key: `${formatKey(key)}${isOptionalField(fieldSchema) ? '?' : ''}`, input, output };
    });
    const input = spellObjectType(fields.map(({ key, input: type }) => ({ key, type })));
    const output = spellObjectType(fields.map(({ key, output: type }) => ({ key, type })));
    const hasPassthrough = schema.calls.some((call) => call.name === 'passthrough');
    return { input, output: hasPassthrough ? `${output} & Record<string, unknown>` : output };
  }

  /**
   * The statement putting a passed field's value on `output`. An optional
   * field is left off when its key was omitted, and `__proto__` is defined
   * rather than assigned, which would reparent `output` instead.
   *
   * ```ts
   * ObjectSchemaEmitter._emitOutputAssignment('name', <pvl.string()>, 'field0')
   * // 'output["name"] = field0;'
   * ```
   */
  private static _emitOutputAssignment(
    key: string,
    fieldSchema: SchemaModel,
    value: string,
  ): string {
    const keyLiteral = JSON.stringify(key);
    const assignment =
      key === '__proto__'
        ? js`Object.defineProperty(output, ${keyLiteral}, { value: ${value}, writable: true, enumerable: true, configurable: true });`
        : js`output[${keyLiteral}] = ${value};`;
    return isOptionalField(fieldSchema)
      ? this.emitBlock(
          js`if (${value} !== undefined || Object.hasOwn(input, ${keyLiteral}))`,
          assignment,
        )
      : assignment;
  }
}
