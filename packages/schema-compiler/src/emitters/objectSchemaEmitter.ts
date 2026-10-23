// The code an `ObjectSchema` compiles to, one method per method of
// `ObjectInterpretedSchema` it mirrors, and the checks of a compiled object, at the
// root or nested in another Schema, which inline every field's checks,
// nested objects' and arrays' included. Its two methods, `.strict()` and
// `.passthrough()`, read its keys rather than its value, so each sits in a
// table of its own kind at that target, and its `_emitSchemaParts` calls the
// one that wins itself.
import {
  ISSUE_CODE,
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
  CompilesMethodArgs,
  EmitBaseCheckArgs,
  EmitSchemaPartsArgs,
  SpellFactoryTypesArgs,
} from './emitter.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import { emitConstraintIssue, emitMessageAroundValue } from '../issue.js';
import { ISSUE_OPTIONS_TYPE } from '../consts.js';
import {
  composeBlock,
  emitCheck,
  emitOutputStatement,
  emitVariableDeclaration,
  js,
  readCallArguments,
} from './emitterUtils.js';
import type { Scope } from './scope.js';
import type {
  CheckingTarget,
  CompositeLocals,
  EmittedCheck,
  EmittedIssue,
  EmittedOutputStatement,
  EmitterMethodOf,
  EmitterMethodTable,
  ParameterTypesOf,
  SchemaParts,
} from './emittersTypes.js';
import { MODIFIER_NAME } from '../enums.js';

// A key that reads bare in a comment or a type.
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

/** The `@pvl/schema` object whose methods `ObjectSchemaEmitter`'s mirror, whatever its shape. */
type PvlAnyObjectSchema = ObjectInterpretedSchema;

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
): EmittedIssue => {
  return emitConstraintIssue({
    code: ISSUE_CODE.UNRECOGNIZED_KEY,
    path: js`[...${path}, key]`,
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
  return fieldSchema.hasModifier({ name: MODIFIER_NAME.OPTIONAL });
};

/**
 * An object's output type from its fields, each with its key formatted and
 * its output type: a field's key is marked `?` when it is optional, and a
 * transformed one's when its function may return `undefined`, which only a
 * conditional type on its type parameter can say. The conditional parts are
 * intersected with the rest and flattened by a homomorphic mapped type, as
 * `@pvl/schema`'s own `ObjectOutput` flattens its parts, so the type is
 * identical to the interpreted one once the type parameter is inferred.
 * `ObjectOutput` itself can't be named: an `as` clause over a type
 * parameter makes each reference a type of its own, which TypeScript can't
 * relate to another.
 *
 * ```ts
 * spellOutputObjectType([{ key: 'name', fieldSchema: <pvl.string().optional()>, output: 'string | undefined' }])
 * // '{ name?: string | undefined }'
 * spellOutputObjectType([{ key: 'name', fieldSchema: <pvl.string()>, output: 'string' }, { key: 'age', fieldSchema: <pvl.string().transform(fn)>, output: 'TArg0Output' }])
 * // '{ [K in keyof ({ name: string } & (undefined extends TArg0Output ? { age?: TArg0Output } : { age: TArg0Output }))]: ({ name: string } & (…))[K] }'
 * ```
 */
const spellOutputObjectType = (
  fields: ReadonlyArray<{ key: string; fieldSchema: Schema; output: string }>,
): string => {
  const plainType = spellObjectType(
    fields
      .filter(({ fieldSchema }) => !isTransformedField(fieldSchema))
      .map(({ key, fieldSchema, output: type }) => ({
        key: `${key}${isOptionalField(fieldSchema) ? '?' : ''}`,
        type,
      })),
  );
  const transformedTypes = fields
    .filter(({ fieldSchema }) => isTransformedField(fieldSchema))
    .map(
      ({ key, output: type }) =>
        `(undefined extends ${type} ? { ${key}?: ${type} } : { ${key}: ${type} })`,
    );
  if (transformedTypes.length === 0) {
    return plainType;
  }
  const composedType = `(${[plainType, ...transformedTypes].join(' & ')})`;
  return `{ [K in keyof ${composedType}]: ${composedType}[K] }`;
};

/**
 * Whether a `.transform()` is chained onto a field's Schema, so its output
 * is whatever the user's function returns, `undefined` included.
 *
 * ```ts
 * isTransformedField(<pvl.string().transform(trim)>) // true
 * isTransformedField(<pvl.string()>)                 // false
 * ```
 */
const isTransformedField = (fieldSchema: Schema): boolean => {
  return fieldSchema.hasModifier({ name: MODIFIER_NAME.TRANSFORM });
};

/**
 * Whether a field's Schema takes `undefined`, so its key may be left out of
 * the input type: it is `.optional()`, or `.coerce()` makes it take any
 * value.
 *
 * ```ts
 * isOptionalInputField(<pvl.number().coerce()>) // true
 * isOptionalInputField(<pvl.number()>)          // false
 * ```
 */
const isOptionalInputField = (fieldSchema: Schema): boolean => {
  return isOptionalField(fieldSchema) || fieldSchema.hasModifier({ name: MODIFIER_NAME.COERCE });
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
  ].join('\n');
};

/**
 * The statement putting a passed field's value on the output. A field whose
 * value may be `undefined`, an optional or a transformed one, is left off
 * when it is and its key was omitted, as the interpreted path leaves it,
 * and `__proto__` is defined rather than assigned, which would reparent the
 * output instead.
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
  return emitOutputStatement({
    statement:
      isOptionalField(fieldSchema) || isTransformedField(fieldSchema)
        ? composeBlock({
            head: js`if (${value} !== undefined || Object.hasOwn(${input}, ${keyLiteral}))`,
            body: assignment,
          })
        : assignment,
  });
};

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
const strict: EmitterMethodOf<PvlAnyObjectSchema['strict'], EmittedCheck, ObjectCheckingTarget> = ({
  target: { value, path, declaredKeys },
  args: [options],
}) =>
  emitCheck({
    loopHead: js`for (const key of Object.keys(${value}))`,
    failsWhen: emitIsUndeclaredKey(declaredKeys),
    issue: emitUnrecognizedKeyIssue(path, options),
  });

/**
 * `.passthrough()`: copies every key of `input` the shape doesn't declare
 * onto `output`, after the declared ones. `__proto__` is defined rather
 * than assigned, which would reparent `output` instead.
 *
 * ```ts
 * for (const key of Object.keys(input)) {
 *   if (key !== "name") {
 *     if (key === "__proto__") {
 *       Object.defineProperty(output, key, { value: input[key], writable: true, enumerable: true, configurable: true });
 *     } else {
 *       output[key] = input[key];
 *     }
 *   }
 * }
 * ```
 */
const passthrough: EmitterMethodOf<
  PvlAnyObjectSchema['passthrough'],
  EmittedOutputStatement,
  ObjectCheckingTarget
> = ({ target: { value, output, declaredKeys } }) =>
  emitOutputStatement({
    statement: js`for (const key of Object.keys(${value})) {
      if (${emitIsUndeclaredKey(declaredKeys)}) {
        if (key === "__proto__") {
          Object.defineProperty(${output}, key, { value: ${value}[key], writable: true, enumerable: true, configurable: true });
        } else {
          ${output}[key] = ${value}[key];
        }
      }
    }`,
  });

export class ObjectSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly parameterTypes: ParameterTypesOf<PvlAnyObjectSchema> = {
    strict: [ISSUE_OPTIONS_TYPE],
    passthrough: [],
  };

  /** `typeof value !== "object" || value === null || Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return this.emitTypeCheck({
      failsWhen: js`typeof ${value} !== "object" || ${value} === null || Array.isArray(${value})`,
      message: OBJECT_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }

  /**
   * `.strict()`, the post-modifier checking an object's keys rather than
   * its value (`ObjectCheckingTarget`). Not in `postModifierChecks`, whose
   * methods read a plain `CheckingTarget`, so it is never dispatched:
   * `_emitSchemaParts` calls it itself when it is the last of `.strict()`
   * and `.passthrough()` chained.
   */
  public static readonly keyChecks = { strict } satisfies EmitterMethodTable<
    EmittedCheck,
    ObjectCheckingTarget
  >;

  /**
   * `.passthrough()`, which copies an object's undeclared keys onto its
   * output. `_emitSchemaParts` calls it itself when it is the last of
   * `.strict()` and `.passthrough()` chained.
   */
  public static readonly outputStatements = { passthrough } satisfies EmitterMethodTable<
    EmittedOutputStatement,
    ObjectCheckingTarget
  >;

  /**
   * Whether it compiles the Schema method `name`: one of its tables holds
   * it, those `_emitSchemaParts` calls itself (`keyChecks`,
   * `outputStatements`) included.
   *
   * ```ts
   * ObjectSchemaEmitter.compilesMethod({ name: 'strict' })   // true
   * ObjectSchemaEmitter.compilesMethod({ name: 'optional' }) // true
   * ObjectSchemaEmitter.compilesMethod({ name: 'union' })    // false
   * ```
   */
  public static override compilesMethod(args: CompilesMethodArgs): boolean {
    return (
      Object.hasOwn(this.keyChecks, args.name) ||
      Object.hasOwn(this.outputStatements, args.name) ||
      super.compilesMethod(args)
    );
  }

  /**
   * An object's parts, at the root or nested in another Schema: its base
   * check, pre-modifiers' parts and post-modifiers' checks, and its
   * composite parts: its locals, every field's checks inlined in shape order
   * as its children, and the output built from the fields.
   *
   * Its post-modifiers run in chain order, once every field has passed.
   * `.strict()` reads its keys rather than its value, and checks them where
   * the last of `.strict()` and `.passthrough()` chained is, which wins
   * (ADR-0007); any other, such as `.refine()`, reads the output, as the
   * interpreted one reads `_checkType`'s (ADR-0035). `.passthrough()` copies
   * the keys the shape doesn't declare onto the output, after the declared
   * fields, and so does `.strict()` under a `.refine()`, which reads them as
   * the interpreted one does; otherwise they are stripped. The frame hands
   * the output on.
   *
   * ```ts
   * ObjectSchemaEmitter._emitSchemaParts({ schema: <pvl.object({ name: pvl.string() }).strict()>, target: <field0 at [...path1, "user"]>, scope })
   * // { baseCheck: 'if (typeof field0 !== "object" || …) { … }', preModifierSteps: [],
   * //   postModifierChecks: ['for (const key of Object.keys(input2)) {\n  if (key !== "name") {\n    issues.push({ code: "UNRECOGNIZED_KEY", … path: [...path2, key] });\n  }\n}'],
   * //   composite: { locals: <locals ending in 2>, declarations: ['const input2 = field0 as Record<string, unknown>;'],
   * //                childChecks: ['// name\nconst field1 = input2["name"];\nif (typeof field1 !== "string") { … path: [...path2, "name"] … }'], setsChildrenApart: true,
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
    // `.strict()` only reports the undeclared keys, so a `.refine()` reads
    // them on the value, as `.passthrough()` keeps them there; with any of
    // them, `.strict()` fails, so the output is never accepted.
    const keepsUndeclaredKeys =
      unknownKeysCall?.name === MODIFIER_NAME.PASSTHROUGH ||
      (unknownKeysCall?.name === MODIFIER_NAME.STRICT &&
        schema.hasModifier({ name: MODIFIER_NAME.REFINE }));

    return {
      baseCheck: this._emitBaseCheck({ schema, target }),
      preModifierSteps: this._emitPreModifierSteps({ schema, target }),
      // In chain order, `.strict()` where the one that wins is chained, as
      // each `.strict()` moves it there and `.passthrough()` removes it.
      postModifierChecks: schema.postModifierCalls.flatMap((call) => {
        if (this.isTransform({ call })) {
          return [];
        }
        if (call.name !== MODIFIER_NAME.STRICT && call.name !== MODIFIER_NAME.PASSTHROUGH) {
          return [
            this.emitMethodCall({
              table: this.postModifierChecks,
              call,
              // It reads the output, as the interpreted one reads `_checkType`'s.
              target: { ...target, value: locals.output },
            }),
          ];
        }
        return call === unknownKeysCall && call.name === MODIFIER_NAME.STRICT
          ? [this.keyChecks.strict({ target: objectTarget, args: readCallArguments(call) })]
          : [];
      }),
      composite: {
        locals,
        declarations: [
          emitVariableDeclaration({
            name: locals.input,
            initializer: js`${target.value} as Record<string, unknown>`,
          }),
        ],
        childChecks: fields.map((field) => emitFieldChecks({ field, locals, scope })),
        setsChildrenApart: true,
        outputStatements: [
          emitOutputStatement({
            statement: js`const ${locals.output}: Record<string, unknown> = {};`,
          }),
          ...fields.map((field) => emitOutputAssignment({ field, objectTarget })),
          ...(keepsUndeclaredKeys
            ? [this.outputStatements.passthrough({ target: objectTarget, args: [] })]
            : []),
        ],
      },
      transforms: this._emitTransforms({ schema, target }),
    };
  }

  /**
   * An object type of the fields' types, the key of a field that takes
   * `undefined` marked `?`: in the input, an optional or coerced one's, and
   * in the output, an optional one's, and a transformed one's when its
   * function may return `undefined` (`spellOutputObjectType`). A
   * `.passthrough()` chained before
   * `chainEnd` widens the output for good, even under a later `.strict()`,
   * as `ObjectInterpretedSchema`'s own types do.
   *
   * ```ts
   * ObjectSchemaEmitter._spellFactoryTypes({ schema: <pvl.object({ name: pvl.string(), age: pvl.number().optional() })> })
   * // { input: '{ name: string; age?: number | undefined }', output: <the same> }
   * ObjectSchemaEmitter._spellFactoryTypes({ schema: <pvl.object({ age: pvl.number().coerce() })> })
   * // { input: '{ age?: unknown }', output: '{ age: number }' }
   * ObjectSchemaEmitter._spellFactoryTypes({ schema: <pvl.object({ age: pvl.string().transform(Number) })> })
   * // { input: '{ age: string }', output: '{ [K in keyof ({} & (undefined extends TArg0Output ? { age?: TArg0Output } : { age: TArg0Output }))]: …[K] }' }
   * ```
   */
  public static override _spellFactoryTypes({
    schema,
    chainEnd = Infinity,
  }: SpellFactoryTypesArgs<ObjectSchema>): SchemaTypes {
    const fields = schema.shape.map(({ key, schema: fieldSchema }) => ({
      key: formatKey(key),
      fieldSchema,
      ...fieldSchema.emitter._spellTypes({ schema: fieldSchema }),
    }));
    const input = spellObjectType(
      fields.map(({ key, fieldSchema, input: type }) => ({
        key: `${key}${isOptionalInputField(fieldSchema) ? '?' : ''}`,
        type,
      })),
    );
    const output = spellOutputObjectType(fields);
    const hasPassthrough = schema.postModifierCalls.some(
      (call) => call.name === MODIFIER_NAME.PASSTHROUGH && call.chainIndex < chainEnd,
    );
    return { input, output: hasPassthrough ? `${output} & Record<string, unknown>` : output };
  }
}
