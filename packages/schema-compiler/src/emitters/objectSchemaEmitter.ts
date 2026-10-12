// The code an `ObjectSchema` compiles to, one static method per method of
// `ObjectSchema` it mirrors, and the checks of a compiled object, at the
// root or nested in another Schema, which inline every field's checks,
// nested objects' and arrays' included.
import {
  ISSUE_CODE,
  OBJECT_SCHEMA_ISSUE_MESSAGE,
  type IssueEditableProps,
  type ObjectSchema as PvlObjectSchema,
} from '@pvl/schema';
import { ROOT_ISSUE_PATH } from '../consts.js';
import type { Schema } from '../schemas/schema.js';
import type { SchemaModifierCall } from '../schemas/schemaTypes.js';
import type { ObjectField, ObjectSchema } from '../schemas/objectSchema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitScope } from './emitScope.js';
import type { EmitChecksArgs, EmitSchemaArgs } from './emitter.js';
import type {
  EmitterMethodOf,
  EmittingCheckMethodInput,
  EmittingCheckMethodOutputWithCheck,
} from './emittersTypes.js';
import { emitIssue, js, type SchemaTypes } from './utils.js';

// A key that reads bare in a comment or a type.
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

/** An object's target, its value as a record, plus the output it builds and the keys its shape declares. */
export type ObjectEmittingCheckMethodInput = EmittingCheckMethodInput & {
  output: string;
  declaredKeys: ReadonlyArray<string>;
};

/** A field of the shape, with the name its value is read into: `field0`, `field1`, … */
export type NamedField = ObjectField & {
  value: string;
};

/**
 * The fields of an object's shape, each named by `scope` up front, so an
 * object's own fields are numbered before any of a nested object's.
 *
 * ```ts
 * nameFields([{ key: 'name', schema }, { key: 'age', schema }], scope)
 * // [{ key: 'name', schema, value: 'field0' }, { key: 'age', schema, value: 'field1' }]
 * ```
 */
const nameFields = (shape: ReadonlyArray<ObjectField>, scope: EmitScope): NamedField[] => {
  return shape.map((field) => ({ ...field, value: scope.nextField() }));
};

/** What an object's emitted checks call its locals: `input`, `output` and `path` at the root, `input1`, `output1` and `path1` nested. */
export type ObjectLocals = {
  input: string;
  output: string;
  /** The object's own Issue path, which its fields' paths extend. */
  path: string;
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
const isOptionalField = (fieldSchema: Schema): boolean => {
  return fieldSchema.preModifierCalls.some((call) => call.name === 'optional');
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
  calls: ReadonlyArray<SchemaModifierCall>,
): SchemaModifierCall | undefined => {
  return [...calls].reverse().find((call) => call.name === 'strict' || call.name === 'passthrough');
};

/** The `@pvl/schema` object whose methods `ObjectSchemaEmitter`'s mirror, whatever its shape. */
type PvlAnyObjectSchema = PvlObjectSchema;

export class ObjectSchemaEmitter extends ChainableSchemaEmitter {
  /** `typeof value !== "object" || value === null || Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static override _getBaseCheck({
    target: { value, issuePath },
  }: EmitChecksArgs): EmittingCheckMethodOutputWithCheck {
    return {
      failsWhen: js`typeof ${value} !== "object" || ${value} === null || Array.isArray(${value})`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_TYPE,
        OBJECT_SCHEMA_ISSUE_MESSAGE._checkType(),
        issuePath,
      ),
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
  public static readonly strict: EmitterMethodOf<
    PvlAnyObjectSchema['strict'],
    string,
    ObjectEmittingCheckMethodInput
  > = ({ target: { value, issuePath, declaredKeys }, args: [options] }) =>
    js`for (const key of Object.keys(${value})) {
      if (${emitIsUndeclaredKey(declaredKeys)}) {
        issues.push(${emitUnrecognizedKeyIssue(issuePath, options)});
      }
    }`;

  /**
   * `.passthrough()`: copies every key of `input` the shape doesn't declare
   * onto `output`, after the declared ones. `__proto__` is defined rather
   * than assigned, which would reparent `output` instead.
   */
  public static readonly passthrough: EmitterMethodOf<
    PvlAnyObjectSchema['passthrough'],
    string,
    ObjectEmittingCheckMethodInput
  > = ({ target: { value, output, declaredKeys } }) =>
    js`for (const key of Object.keys(${value})) {
      if (${emitIsUndeclaredKey(declaredKeys)}) {
        if (key === "__proto__") {
          Object.defineProperty(${output}, key, { value: ${value}[key], writable: true, enumerable: true, configurable: true });
        } else {
          ${output}[key] = ${value}[key];
        }
      }
    }`;

  /**
   * The body of a compiled object's `_checkType`: the type check, every
   * field's checks inlined in shape order, then the unknown-keys handling the
   * last of `.strict()`/`.passthrough()` chose (stripping when neither was
   * chained), then the output built from the fields that passed.
   */
  public static override _emitBody({ schema, scope }: EmitSchemaArgs<ObjectSchema>): string {
    const rootTarget: EmittingCheckMethodInput = { value: 'value', issuePath: ROOT_ISSUE_PATH };
    const locals: ObjectLocals = { input: 'input', output: 'output', path: 'path' };
    const fields = nameFields(schema.shape, scope);
    const objectTarget = this._createObjectTarget({ fields, locals });
    const unknownKeysCall = findUnknownKeysCall(schema.postModifierCalls);

    const strictChecks =
      unknownKeysCall?.name === 'strict'
        ? [
            this.emitCallText({ call: unknownKeysCall, target: objectTarget }),
            this.emitReturnIssuesIfAny(),
          ]
        : [];

    return [
      'const issues: PvlIssue[] = [];',
      this.emitReturnIssueIfFails(this._getBaseCheck({ schema, target: rootTarget, scope })),
      'const input = value as Record<string, unknown>;',
      '',
      ...this._emitFieldChecks({ fields, locals, scope }),
      this.emitReturnIssuesIfAny(),
      ...strictChecks,
      ...this._emitOutput({ fields, objectTarget, unknownKeysCall }),
      'return { value: output };',
    ].join('\n');
  }

  /**
   * The post-modifiers' checks of an object nested in another Schema, at
   * `target`, run once its base check has passed: every field's checks inlined in shape order, then
   * `.strict()`'s, which run only if every field passed, then the output,
   * which replaces the value at `target`. Its locals are numbered, and its
   * own path is kept in one, so its fields' paths stay as short at any
   * depth.
   *
   * ```ts
   * ObjectSchemaEmitter._getPostModifierChecks({ schema: <pvl.object({ name: pvl.string() })>, target: { value: 'field0', issuePath: '[...path, "user"]' }, scope })
   * // const input1 = field0 as Record<string, unknown>;
   * // const path1 = [...path, "user"];
   * //
   * // // name
   * // const field1 = input1["name"];
   * // if (typeof field1 !== "string") { … path: [...path1, "name"] … }
   * //
   * // const output1: Record<string, unknown> = {};
   * // output1["name"] = field1;
   * // field0 = output1;
   * ```
   */
  public static override _getPostModifierChecks({
    schema,
    target,
    scope,
  }: EmitChecksArgs<ObjectSchema>): string[] {
    const suffix = scope.nextLocalSuffix();
    const locals: ObjectLocals = {
      input: `input${suffix}`,
      output: `output${suffix}`,
      path: `path${suffix}`,
    };
    const fields = nameFields(schema.shape, scope);
    const objectTarget = this._createObjectTarget({ fields, locals });
    const unknownKeysCall = findUnknownKeysCall(schema.postModifierCalls);
    const isStrict = unknownKeysCall?.name === 'strict';
    const issueCount = `issueCount${suffix}`;

    return [
      js`const ${locals.input} = ${target.value} as Record<string, unknown>;`,
      ...(fields.length > 0 || isStrict ? [js`const ${locals.path} = ${target.issuePath};`] : []),
      ...(isStrict ? [js`const ${issueCount} = issues.length;`] : []),
      '',
      ...this._emitFieldChecks({ fields, locals, scope }),
      ...(isStrict
        ? [
            this.emitBlock({
              head: js`if (issues.length === ${issueCount})`,
              body: this.emitCallText({ call: unknownKeysCall, target: objectTarget }),
            }),
          ]
        : []),
      ...this._emitOutput({ fields, objectTarget, unknownKeysCall }),
      js`${target.value} = ${locals.output};`,
    ];
  }

  /**
   * `let`: a nested object's value is replaced by the output its checks
   * build.
   *
   * ```ts
   * ObjectSchemaEmitter._spellValueDeclaration() // 'let'
   * ```
   */
  public static override _spellValueDeclaration(): 'const' | 'let' {
    return 'let';
  }

  /**
   * An object type of the fields' types, an optional field's key marked `?`.
   * `.passthrough()` widens the output for good, even under a later
   * `.strict()`, as `ObjectSchema`'s own types do.
   *
   * ```ts
   * ObjectSchemaEmitter._spellTypes({ schema: <pvl.object({ name: pvl.string(), age: pvl.number().optional() })>, scope })
   * // { input: '{ name: string; age?: number | undefined }', output: <the same> }
   * ```
   */
  public static override _spellTypes({ schema, scope }: EmitSchemaArgs<ObjectSchema>): SchemaTypes {
    const fields = schema.shape.map(({ key, schema: fieldSchema }) => {
      const { input, output } = fieldSchema.emitter._emitTypes({ schema: fieldSchema, scope });
      return { key: `${formatKey(key)}${isOptionalField(fieldSchema) ? '?' : ''}`, input, output };
    });
    const input = spellObjectType(fields.map(({ key, input: type }) => ({ key, type })));
    const output = spellObjectType(fields.map(({ key, output: type }) => ({ key, type })));
    const hasPassthrough = schema.postModifierCalls.some((call) => call.name === 'passthrough');
    return { input, output: hasPassthrough ? `${output} & Record<string, unknown>` : output };
  }

  /**
   * The target `.strict()` and `.passthrough()` are emitted at: the object's
   * value as a record, its path, its output and its declared keys.
   *
   * ```ts
   * ObjectSchemaEmitter._createObjectTarget({ fields: <fields name, age>, locals: { input: 'input1', output: 'output1', path: 'path1' } })
   * // { value: 'input1', issuePath: 'path1', output: 'output1', declaredKeys: ['name', 'age'] }
   * ```
   */
  private static _createObjectTarget({
    fields,
    locals,
  }: {
    fields: ReadonlyArray<NamedField>;
    locals: ObjectLocals;
  }): ObjectEmittingCheckMethodInput {
    return {
      value: locals.input,
      issuePath: locals.path,
      output: locals.output,
      declaredKeys: fields.map(({ key }) => key),
    };
  }

  /**
   * Every field's checks, in shape order, each reading its value off
   * `locals.input`. A nested object's or array's value is declared with
   * `let`, as its checks replace it with the output they build.
   *
   * ```ts
   * // name
   * const field0 = input["name"];
   * if (typeof field0 !== "string") { … path: [...path, "name"] … }
   * ```
   */
  private static _emitFieldChecks({
    fields,
    locals,
    scope,
  }: {
    fields: ReadonlyArray<NamedField>;
    locals: ObjectLocals;
    scope: EmitScope;
  }): string[] {
    return fields.map(({ key, schema: fieldSchema, value }) => {
      const { emitter } = fieldSchema;
      return [
        `// ${formatKey(key)}`,
        js`${emitter._spellValueDeclaration()} ${value} = ${locals.input}[${JSON.stringify(key)}];`,
        emitter.emitSchemaChecks({
          schema: fieldSchema,
          target: { value, issuePath: js`[...${locals.path}, ${JSON.stringify(key)}]` },
          scope,
        }),
        '',
      ].join('\n');
    });
  }

  /**
   * The statements building the output from the fields that passed: the
   * declared fields in shape order, then every unknown key when
   * `unknownKeysCall`, the last of `.strict()`/`.passthrough()` chained, is
   * `.passthrough()`.
   *
   * ```ts
   * ObjectSchemaEmitter._emitOutput({ fields: [<field name as field0>], objectTarget: <root target>, unknownKeysCall: undefined })
   * // ['const output: Record<string, unknown> = {};', 'output["name"] = field0;']
   * ```
   */
  private static _emitOutput({
    fields,
    objectTarget,
    unknownKeysCall,
  }: {
    fields: ReadonlyArray<NamedField>;
    objectTarget: ObjectEmittingCheckMethodInput;
    unknownKeysCall: SchemaModifierCall | undefined;
  }): string[] {
    return [
      js`const ${objectTarget.output}: Record<string, unknown> = {};`,
      ...fields.map((field) => this._emitOutputAssignment({ field, objectTarget })),
      ...(unknownKeysCall?.name === 'passthrough'
        ? [this.emitCallText({ call: unknownKeysCall, target: objectTarget })]
        : []),
    ];
  }

  /**
   * The statement putting a passed field's value on the output. An optional
   * field is left off when its key was omitted, and `__proto__` is defined
   * rather than assigned, which would reparent the output instead.
   *
   * ```ts
   * ObjectSchemaEmitter._emitOutputAssignment({ field: { key: 'name', schema: <pvl.string()>, value: 'field0' }, objectTarget: { value: 'input', output: 'output', … } })
   * // 'output["name"] = field0;'
   * ```
   */
  private static _emitOutputAssignment({
    field: { key, schema: fieldSchema, value },
    objectTarget,
  }: {
    field: NamedField;
    objectTarget: ObjectEmittingCheckMethodInput;
  }): string {
    const { output } = objectTarget;
    const keyLiteral = JSON.stringify(key);
    const assignment =
      key === '__proto__'
        ? js`Object.defineProperty(${output}, ${keyLiteral}, { value: ${value}, writable: true, enumerable: true, configurable: true });`
        : js`${output}[${keyLiteral}] = ${value};`;
    return isOptionalField(fieldSchema)
      ? this.emitBlock({
          head: js`if (${value} !== undefined || Object.hasOwn(${objectTarget.value}, ${keyLiteral}))`,
          body: assignment,
        })
      : assignment;
  }
}
