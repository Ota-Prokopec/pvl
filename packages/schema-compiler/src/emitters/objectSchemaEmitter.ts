// The code an `ObjectSchema` compiles to, one static method per method of
// `ObjectInterpretedSchema` it mirrors, and the checks of a compiled object, at the
// root or nested in another Schema, which inline every field's checks,
// nested objects' and arrays' included.
import {
  ISSUE_CODE,
  Issue,
  OBJECT_SCHEMA_ISSUE_MESSAGE,
  type IssueEditableProps,
  type ObjectInterpretedSchema,
} from '@pvl/schema';
import type { ObjectField, ObjectSchema } from '../schemas/objectSchema.js';
import type { RuntimeArgument } from '../schemas/runtimeArgument.js';
import type { Schema } from '../schemas/schema.js';
import type { SchemaModifierCall } from '../schemas/schemaTypes.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitBaseCheckArgs, EmitSchemaPartsArgs, SpellFactoryTypesArgs } from './emitter.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import { emitConstraintIssue, emitIssue, emitMessageAroundValue } from '../issue.js';
import { ISSUE_OPTIONS_TYPE } from '../consts.js';
import { emitCheck, js } from './emitterUtils.js';
import { Frame } from './frame.js';
import type { Scope } from './scope.js';
import type {
  CheckingTarget,
  CompositeLocals,
  EmittedCheck,
  EmittedOutputStatement,
  EmittedVariableDeclaration,
  EmitterMethodOf,
  ParameterTypesOf,
  SchemaParts,
} from './emittersTypes.js';
import { MODIFIER_NAME } from '../enums.js';

// A key that reads bare in a comment or a type.
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

/** An object's target, its value as a record, plus the output it builds and the keys its shape declares. */
export type ObjectCheckingTarget = CheckingTarget & {
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
const nameFields = (shape: ReadonlyArray<ObjectField>, scope: Scope): NamedField[] => {
  return shape.map((field) => ({ ...field, value: scope.nextField() }));
};

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
 * `OBJECT_SCHEMA_ISSUE_MESSAGE.strict`; `options` passed as a Runtime
 * Argument may replace it at runtime.
 *
 * ```ts
 * { code: "UNRECOGNIZED_KEY", message: `Unrecognized key "${key}"`, path: [...path, key] }
 * ```
 */
const emitUnrecognizedKeyIssue = (
  path: string,
  options: IssueEditableProps | RuntimeArgument | undefined,
): string => {
  return emitConstraintIssue({
    code: ISSUE_CODE.UNRECOGNIZED_KEY,
    issuePath: js`[...${path}, key]`,
    options,
    defaultMessage: emitMessageAroundValue(OBJECT_SCHEMA_ISSUE_MESSAGE.strict, 'key'),
  });
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
  return fieldSchema.preModifierCalls.some((call) => call.name === MODIFIER_NAME.OPTIONAL);
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
  return [...calls]
    .reverse()
    .find((call) => call.name === MODIFIER_NAME.STRICT || call.name === MODIFIER_NAME.PASSTHROUGH);
};

/** What {@link createObjectCheckingTarget} reads an object's target from: its Schema at its target, and its locals. */
export type CreateObjectCheckingTargetArgs = {
  schema: ObjectSchema;
  target: CheckingTarget;
  locals: CompositeLocals;
};

/**
 * The target `.strict()` and `.passthrough()` read: the object's value as a
 * record in its `input` local, its path local, which an unknown key's Issue
 * path extends, its `output` local, and the keys its shape declares.
 *
 * ```ts
 * createObjectCheckingTarget({ schema: <pvl.object({ name: pvl.string() })>, target: <field0 at [...path1, "user"]>, locals: <locals ending in 2> })
 * // { value: 'input2', path: 'path2', issuePath: '[...path1, "user"]', output: 'output2', declaredKeys: ['name'] }
 * ```
 */
const createObjectCheckingTarget = ({
  schema,
  target,
  locals,
}: CreateObjectCheckingTargetArgs): ObjectCheckingTarget => {
  return {
    value: locals.input,
    path: locals.path,
    issuePath: target.issuePath,
    output: locals.output,
    declaredKeys: schema.shape.map(({ key }) => key),
  };
};

/** What {@link emitFieldChecks} emits a field's checks for: the field, named, and its object's locals. */
export type EmitFieldChecksArgs = {
  field: NamedField;
  locals: CompositeLocals;
  scope: Scope;
};

/**
 * A field's checks, reading its value off the object's `input` local into
 * the name the field was given. A nested object's or array's value is
 * declared with `let`, as its checks put the output they build back on it.
 *
 * ```ts
 * emitFieldChecks({ field: { key: 'name', schema: <pvl.string()>, value: 'field0' }, locals: <locals ending in 1>, scope })
 * // // name
 * // const field0 = input1["name"];
 * // if (typeof field0 !== "string") { … path: [...path1, "name"] … }
 * //
 * ```
 */
const emitFieldChecks = ({
  field: { key, schema: fieldSchema, value },
  locals,
  scope,
}: EmitFieldChecksArgs): string => {
  const keyLiteral = JSON.stringify(key);
  return [
    `// ${formatKey(key)}`,
    fieldSchema.emitter.emitNestedSchemaChecks({
      schema: fieldSchema,
      value,
      valueType: undefined,
      read: js`${locals.input}[${keyLiteral}]`,
      path: js`[...${locals.path}, ${keyLiteral}]`,
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
 * emitOutputAssignment({ field: { key: 'name', schema: <pvl.string()>, value: 'field0' }, objectTarget: { value: 'input1', output: 'output1', … } })
 * // 'output1["name"] = field0;'
 * emitOutputAssignment({ field: { key: 'age', schema: <pvl.number().optional()>, value: 'field1' }, objectTarget: <the same> })
 * // 'if (field1 !== undefined || Object.hasOwn(input1, "age")) {\n  output1["age"] = field1;\n}'
 * ```
 */
const emitOutputAssignment = ({
  field: { key, schema: fieldSchema, value },
  objectTarget: { value: input, output },
}: {
  field: NamedField;
  objectTarget: ObjectCheckingTarget;
}): EmittedOutputStatement => {
  const keyLiteral = JSON.stringify(key);
  const assignment =
    key === '__proto__'
      ? js`Object.defineProperty(${output}, ${keyLiteral}, { value: ${value}, writable: true, enumerable: true, configurable: true });`
      : js`${output}[${keyLiteral}] = ${value};`;
  return (
    isOptionalField(fieldSchema)
      ? Frame.composeBlock({
          head: js`if (${value} !== undefined || Object.hasOwn(${input}, ${keyLiteral}))`,
          body: assignment,
        })
      : assignment
  ) as EmittedOutputStatement;
};

/** The `@pvl/schema` object whose methods `ObjectSchemaEmitter`'s mirror, whatever its shape. */
type PvlAnyObjectSchema = ObjectInterpretedSchema;

export class ObjectSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly parameterTypes: ParameterTypesOf<PvlAnyObjectSchema> = {
    strict: [ISSUE_OPTIONS_TYPE],
    passthrough: [],
  };

  /** `typeof value !== "object" || value === null || Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitCheck({
      failsWhen: js`typeof ${value} !== "object" || ${value} === null || Array.isArray(${value})`,
      issue: emitIssue(
        new Issue(ISSUE_CODE.INVALID_TYPE, [issuePath], OBJECT_SCHEMA_ISSUE_MESSAGE._checkType()),
      ),
    });
  }

  /**
   * `.strict()`: an `UNRECOGNIZED_KEY` Issue per key of `input` the shape
   * doesn't declare.
   *
   * ```ts
   * for (const key of Object.keys(input)) {
   *   if (key !== "name") {
   *     issues.push({ code: "UNRECOGNIZED_KEY", message: `Unrecognized key "${key}"`, path: [...path, key] });
   *   }
   * }
   * ```
   */
  public static readonly strict: EmitterMethodOf<
    PvlAnyObjectSchema['strict'],
    EmittedCheck,
    ObjectCheckingTarget
  > = ({ target: { value, path, declaredKeys }, args: [options] }) =>
    js`for (const key of Object.keys(${value})) {
      if (${emitIsUndeclaredKey(declaredKeys)}) {
        issues.push(${emitUnrecognizedKeyIssue(path, options)});
      }
    }` as EmittedCheck;

  /**
   * `.passthrough()`: copies every key of `input` the shape doesn't declare
   * onto `output`, after the declared ones. `__proto__` is defined rather
   * than assigned, which would reparent `output` instead.
   */
  public static readonly passthrough: EmitterMethodOf<
    PvlAnyObjectSchema['passthrough'],
    EmittedOutputStatement,
    ObjectCheckingTarget
  > = ({ target: { value, output, declaredKeys } }) =>
    js`for (const key of Object.keys(${value})) {
      if (${emitIsUndeclaredKey(declaredKeys)}) {
        if (key === "__proto__") {
          Object.defineProperty(${output}, key, { value: ${value}[key], writable: true, enumerable: true, configurable: true });
        } else {
          ${output}[key] = ${value}[key];
        }
      }
    }` as EmittedOutputStatement;

  /**
   * An object's parts, at the root or nested in another Schema: its base
   * check, short-circuit conditions and post-modifiers' checks, and its
   * composite parts: its locals, every field's checks inlined in shape order
   * as its children, and the output built from the fields.
   *
   * Its post-modifiers read its keys rather than its value. `.strict()`
   * checks them when it is the last of `.strict()` and `.passthrough()`
   * chained, which wins (ADR-0007), and the frame runs it only once every
   * field has passed. `.passthrough()` copies them onto the output instead,
   * after the declared fields, and with neither the keys the shape doesn't
   * declare are stripped. The frame hands the output on.
   *
   * ```ts
   * ObjectSchemaEmitter._emitSchemaParts({ schema: <pvl.object({ name: pvl.string() }).strict()>, target: <field0 at [...path1, "user"]>, scope })
   * // { baseCheck: 'if (typeof field0 !== "object" || …) { … }', shortCircuitConditions: [],
   * //   postModifierChecks: ['for (const key of Object.keys(input2)) {\n  if (key !== "name") {\n    issues.push({ code: "UNRECOGNIZED_KEY", … path: [...path2, key] });\n  }\n}'],
   * //   composite: { locals: <locals ending in 2>, declarations: ['const input2 = field0 as Record<string, unknown>;', ''],
   * //                childChecks: ['// name\nconst field1 = input2["name"];\nif (typeof field1 !== "string") { … path: [...path2, "name"] … }\n'],
   * //                outputStatements: ['const output2: Record<string, unknown> = {};', 'output2["name"] = field1;'] } }
   * ```
   */
  public static override _emitSchemaParts({
    schema,
    target,
    scope,
  }: EmitSchemaPartsArgs<ObjectSchema>): SchemaParts {
    // Numbered first, so before its fields and any Schema nested in them.
    const locals: CompositeLocals = scope.nextCompositeLocals();
    const fields = nameFields(schema.shape, scope);
    const objectTarget: ObjectCheckingTarget = createObjectCheckingTarget({
      schema,
      target,
      locals,
    });
    const unknownKeysCall = findUnknownKeysCall(schema.postModifierCalls);

    return {
      baseCheck: this._emitBaseCheck({ schema, target }),
      shortCircuitConditions: this._emitShortCircuitConditions({ schema, target }),
      postModifierChecks:
        unknownKeysCall?.name === 'strict'
          ? [this.emitCall({ call: unknownKeysCall, target: objectTarget }) as EmittedCheck]
          : [],
      composite: {
        locals,
        declarations: [
          js`const ${locals.input} = ${target.value} as Record<string, unknown>;` as EmittedVariableDeclaration,
          // Sets the fields apart, each of which ends in a blank line too.
          '' as EmittedVariableDeclaration,
        ],
        childChecks: fields.map((field) => emitFieldChecks({ field, locals, scope })),
        outputStatements: [
          js`const ${locals.output}: Record<string, unknown> = {};` as EmittedOutputStatement,
          ...fields.map((field) => emitOutputAssignment({ field, objectTarget })),
          ...(unknownKeysCall?.name === 'passthrough'
            ? [
                this.emitCall({
                  call: unknownKeysCall,
                  target: objectTarget,
                }) as EmittedOutputStatement,
              ]
            : []),
        ],
      },
    };
  }

  /**
   * An object type of the fields' types, an optional field's key marked `?`.
   * `.passthrough()` widens the output for good, even under a later
   * `.strict()`, as `ObjectInterpretedSchema`'s own types do.
   *
   * ```ts
   * ObjectSchemaEmitter._spellFactoryTypes({ schema: <pvl.object({ name: pvl.string(), age: pvl.number().optional() })> })
   * // { input: '{ name: string; age?: number | undefined }', output: <the same> }
   * ```
   */
  public static override _spellFactoryTypes({
    schema,
  }: SpellFactoryTypesArgs<ObjectSchema>): SchemaTypes {
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
