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
import type {
  AddCompositePartsArgs,
  EmitBaseCheckArgs,
  EmitPostModifierChecksArgs,
  SpellFactoryTypesArgs,
} from './emitter.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import { emitConstraintIssue, emitIssue, emitMessageAroundValue } from '../issue.js';
import { ISSUE_OPTIONS_TYPE } from '../consts.js';
import { emitCheck, js } from './emitterUtils.js';
import { Frame } from './frame.js';
import type { Scope } from './scope.js';
import type {
  CheckingTarget,
  EmittedCheck,
  EmittedOutputStatement,
  EmittedVariableDeclaration,
  EmitterMethodOf,
  ParameterTypesOf,
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
 * { code: "UNRECOGNIZED_KEY", message: "Unrecognized key \"" + key + "\"", path: [...path, key] }
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

/** What {@link createObjectCheckingTarget} reads an object's target from: its Schema, in the frame its checks are composed in. */
export type CreateObjectCheckingTargetArgs = {
  schema: ObjectSchema;
  frame: Frame;
};

/**
 * The target `.strict()` and `.passthrough()` read: the object's value as a
 * record in its `input` local, its path local, its `output` local, and the
 * keys its shape declares.
 *
 * ```ts
 * createObjectCheckingTarget({ schema: <pvl.object({ name: pvl.string() })>, frame: <frame of field0, nested> })
 * // { value: 'input1', issuePath: 'path1', output: 'output1', declaredKeys: ['name'] }
 * ```
 */
const createObjectCheckingTarget = ({
  schema,
  frame,
}: CreateObjectCheckingTargetArgs): ObjectCheckingTarget => {
  return {
    value: frame.inputVariableName,
    issuePath: frame.pathVariableName,
    output: frame.outputVariableName,
    declaredKeys: schema.shape.map(({ key }) => key),
  };
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
  frame: Frame;
  scope: Scope;
}): string => {
  const { emitter } = fieldSchema;
  const keyLiteral = JSON.stringify(key);
  return [
    `// ${formatKey(key)}`,
    js`${emitter._spellValueDeclaration()} ${value} = ${frame.inputVariableName}[${keyLiteral}];`,
    emitter.emitSchemaChecks({
      schema: fieldSchema,
      target: { value, issuePath: js`[...${frame.pathVariableName}, ${keyLiteral}]` },
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
  public static override _emitBaseCheck({
    target: { value, issuePath },
  }: EmitBaseCheckArgs): EmittedCheck {
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
   *     issues.push({ code: "UNRECOGNIZED_KEY", message: "Unrecognized key \"" + key + "\"", path: [...path, key] });
   *   }
   * }
   * ```
   */
  public static readonly strict: EmitterMethodOf<
    PvlAnyObjectSchema['strict'],
    EmittedCheck,
    ObjectCheckingTarget
  > = ({ target: { value, issuePath, declaredKeys }, args: [options] }) =>
    js`for (const key of Object.keys(${value})) {
      if (${emitIsUndeclaredKey(declaredKeys)}) {
        issues.push(${emitUnrecognizedKeyIssue(issuePath, options)});
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
   * The checks of an object's post-modifiers: `.strict()`'s, when it is the
   * last of `.strict()` and `.passthrough()` chained, which wins (ADR-0007),
   * reading the object's keys rather than its value. `.passthrough()` builds
   * the output instead (see `_addCompositeParts`), and with neither the keys
   * the shape doesn't declare are stripped. The frame runs them only once
   * every field has passed.
   *
   * ```ts
   * ObjectSchemaEmitter._emitPostModifierChecks({ schema: <pvl.object({ name: pvl.string() }).strict()>, frame: <frame of field0, nested> })
   * // ['for (const key of Object.keys(input1)) {\n  if (key !== "name") {\n    issues.push({ code: "UNRECOGNIZED_KEY", … path: [...path1, key] });\n  }\n}']
   * ObjectSchemaEmitter._emitPostModifierChecks({ schema: <pvl.object({ name: pvl.string() }).strict().passthrough()>, frame }) // []
   * ```
   */
  public static override _emitPostModifierChecks({
    schema,
    frame,
  }: EmitPostModifierChecksArgs<ObjectSchema>): EmittedCheck[] {
    const unknownKeysCall = findUnknownKeysCall(schema.postModifierCalls);
    return unknownKeysCall?.name === 'strict'
      ? [
          this.emitPostModifierCheck({
            call: unknownKeysCall,
            target: createObjectCheckingTarget({ schema, frame }),
          }),
        ]
      : [];
  }

  /**
   * Adds to `frame` an object's parts once its type check has passed, at
   * the root or nested in another Schema: its locals, every field's checks
   * inlined in shape order as its children, and the output built from the
   * fields, then `.passthrough()`'s copy of the keys the shape doesn't
   * declare, when it is the last of `.strict()` and `.passthrough()`
   * chained. The frame hands the output on.
   *
   * ```ts
   * ObjectSchemaEmitter._addCompositeParts({ schema: <pvl.object({ name: pvl.string() })>, frame: <frame of field0 at [...path, "user"], nested>, scope, isRoot: false, postModifierChecks: [] })
   * // adds the declarations ['const path1 = [...path, "user"];', 'const input1 = field0 as Record<string, unknown>;', ''],
   * // the child's checks ['// name\nconst field1 = input1["name"];\nif (typeof field1 !== "string") { … path: [...path1, "name"] … }\n'],
   * // and the output statements ['const output1: Record<string, unknown> = {};', 'output1["name"] = field1;']
   * ```
   */
  public static override _addCompositeParts({
    schema,
    frame,
    scope,
    isRoot,
    postModifierChecks,
  }: AddCompositePartsArgs<ObjectSchema>): void {
    const fields = nameFields(schema.shape, scope);
    const objectTarget = createObjectCheckingTarget({ schema, frame });
    const unknownKeysCall = findUnknownKeysCall(schema.postModifierCalls);

    frame.addDeclarations(
      ...this.emitDeclarations({
        frame,
        isRoot,
        readsPath: fields.length > 0 || postModifierChecks.length > 0,
        postModifierChecks,
      }),
      js`const ${frame.inputVariableName} = ${frame.checkingTarget.value} as Record<string, unknown>;` as EmittedVariableDeclaration,
      // Sets the fields apart, each of which ends in a blank line too.
      '' as EmittedVariableDeclaration,
    );
    frame.addChildChecks(...fields.map((field) => emitFieldChecks({ field, frame, scope })));
    frame.addOutputStatements(
      js`const ${frame.outputVariableName}: Record<string, unknown> = {};` as EmittedOutputStatement,
      ...fields.map((field) => emitOutputAssignment({ field, objectTarget })),
      ...(unknownKeysCall?.name === 'passthrough'
        ? [this.emitCall({ call: unknownKeysCall, target: objectTarget }) as EmittedOutputStatement]
        : []),
    );
  }

  /**
   * `true`: an object holds its fields' Schemas, and its checks build its
   * output, field by field, in locals of their own (`input`, `output`;
   * `input1`, … nested).
   *
   * ```ts
   * ObjectSchemaEmitter._isComposite() // true
   * ```
   */
  public static override _isComposite(): boolean {
    return true;
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
