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
import type { ObjectField, ObjectSchema } from '../schemas/objectSchema.js';
import type { Schema } from '../schemas/schema.js';
import type { SchemaModifierCall } from '../schemas/schemaTypes.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitFrame } from './emitFrame.js';
import type { EmitScope } from './emitScope.js';
import type { EmitChecksArgs, EmitSchemaArgs, EmitTypedChecksArgs } from './emitter.js';
import type {
  EmitterMethodOf,
  EmittingCheckMethodInput,
  EmittingCheckMethodOutputWithCheck,
} from './emitterTypes.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import { emitBlock, emitCheck, emitIssue, js } from './emitterUtils.js';

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

/**
 * A field's checks, reading its value off the object's `input` into the
 * name the field was given. A nested object's or array's value is declared
 * with `let`, as its checks put the output they build back on it.
 *
 * ```ts
 * emitFieldChecks({ field: { key: 'name', schema: <pvl.string()>, value: 'field0' }, frame: <frame at the root>, scope })
 * // // name
 * // const field0 = input["name"];
 * // if (typeof field0 !== "string") { … path: [...path, "name"] … }
 * //
 * ```
 */
const emitFieldChecks = ({
  field: { key, schema: fieldSchema, value },
  frame,
  scope,
}: {
  field: NamedField;
  frame: EmitFrame;
  scope: EmitScope;
}): string => {
  const { emitter } = fieldSchema;
  const keyLiteral = JSON.stringify(key);
  return [
    `// ${formatKey(key)}`,
    js`${emitter._spellValueDeclaration()} ${value} = ${frame.input}[${keyLiteral}];`,
    emitter.emitSchemaChecks({
      schema: fieldSchema,
      target: { value, issuePath: js`[...${frame.path}, ${keyLiteral}]` },
      scope,
    }),
    '',
  ].join('\n');
};

/**
 * The statement putting a passed field's value on the output. An optional
 * field is left off when its key was omitted, and `__proto__` is defined
 * rather than assigned, which would reparent the output instead.
 *
 * ```ts
 * emitOutputAssignment({ field: { key: 'name', schema: <pvl.string()>, value: 'field0' }, objectTarget: { value: 'input', output: 'output', … } })
 * // 'output["name"] = field0;'
 * emitOutputAssignment({ field: { key: 'age', schema: <pvl.number().optional()>, value: 'field1' }, objectTarget: <the same> })
 * // 'if (field1 !== undefined || Object.hasOwn(input, "age")) {\n  output["age"] = field1;\n}'
 * ```
 */
const emitOutputAssignment = ({
  field: { key, schema: fieldSchema, value },
  objectTarget: { value: input, output },
}: {
  field: NamedField;
  objectTarget: ObjectEmittingCheckMethodInput;
}): string => {
  const keyLiteral = JSON.stringify(key);
  const assignment =
    key === '__proto__'
      ? js`Object.defineProperty(${output}, ${keyLiteral}, { value: ${value}, writable: true, enumerable: true, configurable: true });`
      : js`${output}[${keyLiteral}] = ${value};`;
  return isOptionalField(fieldSchema)
    ? emitBlock({
        head: js`if (${value} !== undefined || Object.hasOwn(${input}, ${keyLiteral}))`,
        body: assignment,
      })
    : assignment;
};

/** The `@pvl/schema` object whose methods `ObjectSchemaEmitter`'s mirror, whatever its shape. */
type PvlAnyObjectSchema = PvlObjectSchema;

export class ObjectSchemaEmitter extends ChainableSchemaEmitter {
  /** `typeof value !== "object" || value === null || Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static override _emitBaseCheck({
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
   * An object's checks once its type check has passed, at the root or nested
   * in another Schema: every field's checks inlined in shape order, then
   * `.strict()`'s, which run only once every field has passed, then the
   * output built from the fields, which the frame hands on. The last of `.strict()` and
   * `.passthrough()` chained decides the keys the shape doesn't declare:
   * `.passthrough()` copies them onto the output, and with neither they are
   * stripped (ADR-0007).
   *
   * ```ts
   * ObjectSchemaEmitter._emitTypedChecks({ schema: <pvl.object({ name: pvl.string() })>, frame: <frame of field0 at [...path, "user"], nested>, scope })
   * // const input1 = field0 as Record<string, unknown>;
   * // const path1 = [...path, "user"];
   * //
   * // // name
   * // const field1 = input1["name"];
   * // if (typeof field1 !== "string") { … path: [...path1, "name"] … }
   * //
   * // const output1: Record<string, unknown> = {};
   * // output1["name"] = field1;
   * ```
   */
  public static override _emitTypedChecks({
    schema,
    frame,
    scope,
  }: EmitTypedChecksArgs<ObjectSchema>): string[] {
    const fields = nameFields(schema.shape, scope);
    const objectTarget: ObjectEmittingCheckMethodInput = {
      value: frame.input,
      issuePath: frame.path,
      output: frame.output,
      declaredKeys: fields.map(({ key }) => key),
    };
    // `.strict()`'s loop is a post-modifier; `.passthrough()`'s builds the output.
    const unknownKeysCall = findUnknownKeysCall(schema.postModifierCalls);
    const unknownKeysStatements =
      unknownKeysCall === undefined
        ? []
        : [emitCheck(this.emitCall({ call: unknownKeysCall, target: objectTarget }))];
    const strictChecks = unknownKeysCall?.name === 'strict' ? unknownKeysStatements : [];
    const passthroughCopy = unknownKeysCall?.name === 'passthrough' ? unknownKeysStatements : [];

    return [
      js`const ${frame.input} = ${frame.target.value} as Record<string, unknown>;`,
      ...frame.emitDeclarations({
        readsPath: fields.length > 0 || strictChecks.length > 0,
        postModifierChecks: strictChecks,
      }),
      '',
      ...fields.map((field) => emitFieldChecks({ field, frame, scope })),
      ...frame.emitOnceChildrenPassed({ postModifierChecks: strictChecks }),
      js`const ${frame.output}: Record<string, unknown> = {};`,
      ...fields.map((field) => emitOutputAssignment({ field, objectTarget })),
      ...passthroughCopy,
    ];
  }

  /**
   * `true`: an object's checks build its output, field by field, in locals
   * of their own (`input`, `output`; `input1`, … nested).
   *
   * ```ts
   * ObjectSchemaEmitter._buildsOutput() // true
   * ```
   */
  public static override _buildsOutput(): boolean {
    return true;
  }

  /**
   * An object type of the fields' types, an optional field's key marked `?`.
   * `.passthrough()` widens the output for good, even under a later
   * `.strict()`, as `ObjectSchema`'s own types do.
   *
   * ```ts
   * ObjectSchemaEmitter._spellFactoryTypes({ schema: <pvl.object({ name: pvl.string(), age: pvl.number().optional() })> })
   * // { input: '{ name: string; age?: number | undefined }', output: <the same> }
   * ```
   */
  public static override _spellFactoryTypes({ schema }: EmitSchemaArgs<ObjectSchema>): SchemaTypes {
    const fields = schema.shape.map(({ key, schema: fieldSchema }) => {
      const { input, output } = fieldSchema.emitter._spellTypes({ schema: fieldSchema });
      return { key: `${formatKey(key)}${isOptionalField(fieldSchema) ? '?' : ''}`, input, output };
    });
    const input = spellObjectType(fields.map(({ key, input: type }) => ({ key, type })));
    const output = spellObjectType(fields.map(({ key, output: type }) => ({ key, type })));
    const hasPassthrough = schema.postModifierCalls.some((call) => call.name === 'passthrough');
    return { input, output: hasPassthrough ? `${output} & Record<string, unknown>` : output };
  }
}
