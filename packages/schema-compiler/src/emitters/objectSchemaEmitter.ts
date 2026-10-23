// The code an `ObjectSchema` compiles to, one method per method of
// `ObjectInterpretedSchema` it mirrors, and the composite parts of a compiled
// object, at the root or nested in another Schema, which inline every
// field's checks, nested objects' and arrays' included. Its two methods,
// `.strict()` and `.passthrough()`, read its keys rather than its value, so
// each sits in a table of its own kind at that target, and its
// `_emitPostModifierChecks` and `_emitCompositeParts` call the one that wins
// themselves.
import {
  ISSUE_CODE,
  OBJECT_SCHEMA_ISSUE_MESSAGE,
  type IssueEditableProps,
  type ObjectInterpretedSchema,
} from '@pvl/schema';
import type { ObjectField, ObjectSchema } from '../schemas/objectSchema.js';
import type { RuntimeArgument } from '../schemas/runtimeArgument.js';
import type { SchemaModifierCall, SchemaTypes, SpelledType } from '../schemas/schemaTypes.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type {
  CompiledStructure,
  CompilesMethodArgs,
  EmitBaseCheckArgs,
  EmitCompiledStructureArgs,
  EmitPostModifierChecksArgs,
  EmitSchemaPartsArgs,
  SpellTypesArgs,
} from './emitter.js';
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
  CompositeParts,
  EmittedCheck,
  EmittedIssue,
  EmittedOutputStatement,
  EmitterMethodOf,
  EmitterMethodTable,
  ParameterTypesOf,
} from './emittersTypes.js';
import { MODIFIER_NAME, UNDEFINEDNESS } from '../enums.js';

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
 * An object type from its fields, each with its key formatted and its
 * type, a key marked `?` when its type always admits `undefined`. One whose
 * type admits it only when a type parameter does, as a transformed
 * field's, which only a conditional type on that parameter can say, is
 * intersected with the rest, and the parts are flattened by a homomorphic
 * mapped type, as `@pvl/schema`'s own `ObjectOutput` flattens its parts, so
 * the type is identical to the interpreted one once the type parameter is
 * inferred. `ObjectOutput` itself can't be named: an `as` clause over a type
 * parameter makes each reference a type of its own, which TypeScript can't
 * relate to another.
 *
 * ```ts
 * spellFieldsType([{ key: 'name', type: { text: 'string | undefined', undefinedness: 'ALWAYS' } }])
 * // '{ name?: string | undefined }'
 * spellFieldsType([{ key: 'name', type: { text: 'string', undefinedness: 'NEVER' } }, { key: 'age', type: { text: 'TArg0Output', undefinedness: 'CONDITIONAL' } }])
 * // '{ [K in keyof ({ name: string } & (undefined extends TArg0Output ? { age?: TArg0Output } : { age: TArg0Output }))]: ({ name: string } & (…))[K] }'
 * ```
 */
const spellFieldsType = (fields: ReadonlyArray<{ key: string; type: SpelledType }>): string => {
  const plainType = spellObjectType(
    fields
      .filter(({ type }) => type.undefinedness !== UNDEFINEDNESS.CONDITIONAL)
      .map(({ key, type: { text, undefinedness } }) => ({
        key: `${key}${undefinedness === UNDEFINEDNESS.ALWAYS ? '?' : ''}`,
        type: text,
      })),
  );
  const conditionalTypes = fields
    .filter(({ type }) => type.undefinedness === UNDEFINEDNESS.CONDITIONAL)
    .map(
      ({ key, type: { text } }) =>
        `(undefined extends ${text} ? { ${key}?: ${text} } : { ${key}: ${text} })`,
    );
  if (conditionalTypes.length === 0) {
    return plainType;
  }
  const composedType = `(${[plainType, ...conditionalTypes].join(' & ')})`;
  return `{ [K in keyof ${composedType}]: ${composedType}[K] }`;
};

/**
 * Whether `call` is `.strict()` or `.passthrough()`, which read an object's
 * keys rather than its value.
 *
 * ```ts
 * isUnknownKeysCall(<.strict()>)     // true
 * isUnknownKeysCall(<.refine(isOk)>) // false
 * ```
 */
const isUnknownKeysCall = (call: SchemaModifierCall): boolean => {
  return call.name === MODIFIER_NAME.STRICT || call.name === MODIFIER_NAME.PASSTHROUGH;
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
  return [...calls].reverse().find((call) => isUnknownKeysCall(call));
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
 * output may be `undefined`, an optional or a transformed one's, is left
 * off when it is and its key was omitted, as the interpreted path leaves
 * it, and `__proto__` is defined rather than assigned, which would reparent
 * the output instead.
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
  const { output: outputType } = fieldSchema.emitter._spellTypes({ schema: fieldSchema });
  return emitOutputStatement({
    statement:
      outputType.undefinedness !== UNDEFINEDNESS.NEVER
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
   * `_emitPostModifierChecks` calls it itself when it is the last of
   * `.strict()` and `.passthrough()` chained.
   */
  public static readonly keyChecks = { strict } satisfies EmitterMethodTable<
    EmittedCheck,
    ObjectCheckingTarget
  >;

  /**
   * `.passthrough()`, which copies an object's undeclared keys onto its
   * output. `_emitCompositeParts` calls it itself when it is the last of
   * `.strict()` and `.passthrough()` chained.
   */
  public static readonly outputStatements = { passthrough } satisfies EmitterMethodTable<
    EmittedOutputStatement,
    ObjectCheckingTarget
  >;

  /**
   * Whether it compiles the Schema method `name`: one of its tables holds
   * it, those it calls itself (`keyChecks`, `outputStatements`) included.
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
   * An object's post-modifiers' checks, in chain order, once every field
   * has passed. `.strict()` reads its keys rather than its value, and
   * checks them where the last of `.strict()` and `.passthrough()` chained
   * is, which wins (ADR-0007), as each `.strict()` moves it there and
   * `.passthrough()` removes it; any other, such as `.refine()`, reads the
   * output (`target`), as the interpreted one reads `_checkType`'s
   * (ADR-0035). Throws without `locals`, which an object, a composite,
   * always has.
   *
   * ```ts
   * ObjectSchemaEmitter._emitPostModifierChecks({ schema: <pvl.object({ name: pvl.string() }).strict()>, target: <output2 at [...path1, "user"]>, locals: <locals ending in 2> })
   * // ['for (const key of Object.keys(input2)) {\n  if (key !== "name") {\n    issues.push({ code: "UNRECOGNIZED_KEY", … path: [...path2, key] });\n  }\n}']
   * ```
   */
  public static override _emitPostModifierChecks({
    schema,
    target,
    locals,
  }: EmitPostModifierChecksArgs<ObjectSchema>): EmittedCheck[] {
    if (locals === undefined) {
      throw new Error(`${this.name} has no composite locals to check an object's keys with.`);
    }
    const unknownKeysCall = findUnknownKeysCall(schema.postModifierCalls);
    return schema.postModifierCalls.flatMap((call) => {
      if (!isUnknownKeysCall(call)) {
        return [this.emitMethodCall({ table: this.postModifierChecks, call, target })];
      }
      return call === unknownKeysCall && call.name === MODIFIER_NAME.STRICT
        ? [
            this.keyChecks.strict({
              target: createObjectCheckingTarget({ schema, target, locals }),
              args: readCallArguments(call),
            }),
          ]
        : [];
    });
  }

  /**
   * An object's composite parts, at the root or nested in another Schema:
   * its locals, every field's checks inlined in shape order as its
   * children, and the output built from the fields. `.passthrough()` copies
   * the keys the shape doesn't declare onto the output, after the declared
   * fields, and so does `.strict()` when another post-modifier reads the
   * output, as the interpreted value it reads still carries them; otherwise
   * they are stripped. The frame hands the output on.
   *
   * ```ts
   * ObjectSchemaEmitter._emitCompositeParts({ schema: <pvl.object({ name: pvl.string() }).strict()>, target: <field0 at [...path1, "user"]>, scope })
   * // { locals: <locals ending in 2>, declarations: ['const input2 = field0 as Record<string, unknown>;'],
   * //   childChecks: ['// name\nconst field1 = input2["name"];\nif (typeof field1 !== "string") { … path: [...path2, "name"] … }'], setsChildrenApart: true,
   * //   outputStatements: ['const output2: Record<string, unknown> = {};', 'output2["name"] = field1;'] }
   * ```
   */
  protected static override _emitCompositeParts({
    schema,
    target,
    scope,
  }: EmitSchemaPartsArgs<ObjectSchema>): CompositeParts {
    // Numbered first, so before its fields and any Schema nested in them.
    const locals: CompositeLocals = scope.nextCompositeLocals();
    const fields = nameFields(schema.shape, scope);
    const objectTarget: ObjectCheckingTarget = createObjectCheckingTarget({
      schema,
      target,
      locals,
    });
    const unknownKeysCall = findUnknownKeysCall(schema.postModifierCalls);
    // `.strict()` only reports the undeclared keys, so a post-modifier
    // reading the output reads them on it, as `.passthrough()` keeps them
    // there; with any of them, `.strict()` fails, so the output is never
    // accepted.
    const keepsUndeclaredKeys =
      unknownKeysCall?.name === MODIFIER_NAME.PASSTHROUGH ||
      (unknownKeysCall?.name === MODIFIER_NAME.STRICT &&
        schema.postModifierCalls.some((call) => !isUnknownKeysCall(call)));

    return {
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
    };
  }

  /**
   * An object type of the fields' types, the key of a field whose type
   * admits `undefined` marked `?` (`spellFieldsType`): in the input, an
   * optional or coerced one's, and in the output, an optional one's, and a
   * transformed one's when its function may return `undefined`. A
   * `.passthrough()` chained before `before` widens the output for good,
   * even under a later `.strict()`, as `ObjectInterpretedSchema`'s own types
   * do. An object itself never admits `undefined`.
   *
   * ```ts
   * ObjectSchemaEmitter._spellFactoryTypes({ schema: <pvl.object({ name: pvl.string(), age: pvl.number().optional() })> })
   * // { input: { text: '{ name: string; age?: number | undefined }', undefinedness: 'NEVER' }, output: <the same> }
   * ObjectSchemaEmitter._spellFactoryTypes({ schema: <pvl.object({ age: pvl.number().coerce() })> })
   * // { input: { text: '{ age?: unknown }', … }, output: { text: '{ age: number }', … } }
   * ObjectSchemaEmitter._spellFactoryTypes({ schema: <pvl.object({ age: pvl.string().transform(Number) })> })
   * // { input: { text: '{ age: string }', … }, output: { text: '{ [K in keyof ({} & (undefined extends TArg0Output ? { age?: TArg0Output } : { age: TArg0Output }))]: …[K] }', … } }
   * ```
   */
  public static override _spellFactoryTypes({
    schema,
    before,
  }: SpellTypesArgs<ObjectSchema>): SchemaTypes {
    const fields = schema.shape.map(({ key, schema: fieldSchema }) => ({
      key: formatKey(key),
      ...fieldSchema.emitter._spellTypes({ schema: fieldSchema }),
    }));
    const input = spellFieldsType(fields.map(({ key, input: type }) => ({ key, type })));
    const output = spellFieldsType(fields.map(({ key, output: type }) => ({ key, type })));
    const hasPassthrough = schema
      .findCallsBefore(before)
      .some((call) => call.name === MODIFIER_NAME.PASSTHROUGH);
    return {
      input: { text: input, undefinedness: UNDEFINEDNESS.NEVER },
      output: {
        text: hasPassthrough ? `${output} & Record<string, unknown>` : output,
        undefinedness: UNDEFINEDNESS.NEVER,
      },
    };
  }

  /**
   * A compiled object's `shape`: the Compiled Schema of each Standalone Key,
   * the fields marked `.standalone()`, built by the constructor, and no
   * other key, as `ObjectInterpretedSchema`'s own `shape` holds (ADR-0036).
   * With none, it is `{}`, which its declaration initializes. `__proto__`
   * is a computed key, which an object literal defines rather than
   * reparenting the object with.
   *
   * ```ts
   * ObjectSchemaEmitter._emitCompiledStructure({ schema: <pvl.object({ name: pvl.string().standalone(), age: pvl.number() })>, className: 'PvlCompiledSchema0', nextElementIndex })
   * // { type: '{ readonly shape: { readonly name: PvlSchema<string, string> & PvlStandaloneMarker } }', composed: { declaration: 'readonly shape: { … };', statement: 'this.shape = {\n  "name": (new (class PvlCompiledSchema0_0 …)() as …),\n};' }, elements: [] }
   * ObjectSchemaEmitter._emitCompiledStructure({ schema: <pvl.object({ age: pvl.number() })>, … })
   * // { type: '{ readonly shape: {} }', composed: { declaration: 'readonly shape: {} = {};', statement: undefined }, elements: [] }
   * ```
   */
  protected static override _emitCompiledStructure({
    schema,
    className,
    nextElementIndex,
  }: EmitCompiledStructureArgs<ObjectSchema>): CompiledStructure {
    const standaloneKeys = schema.shape.flatMap(({ key, schema: fieldSchema }, index) =>
      fieldSchema.isStandalone
        ? [
            {
              key,
              ...fieldSchema.emitter.emitStandaloneCompiledSchema({
                schema: fieldSchema,
                className: js`${className}_${String(index)}`,
                nextElementIndex,
              }),
            },
          ]
        : [],
    );
    if (standaloneKeys.length === 0) {
      return {
        type: '{ readonly shape: {} }',
        composed: { declaration: 'readonly shape: {} = {};', statement: undefined },
        elements: [],
      };
    }
    const shapeType = js`{ ${standaloneKeys.map(({ key, type }) => js`readonly ${formatKey(key)}: ${type}`).join('; ')} }`;
    return {
      type: js`{ readonly shape: ${shapeType} }`,
      composed: {
        declaration: js`readonly shape: ${shapeType};`,
        statement: `${composeBlock({
          head: 'this.shape =',
          body: standaloneKeys
            .map(({ key, expression }) => {
              const keyLiteral = JSON.stringify(key);
              // A plain template: `js` would strip the multi-line class's indentation.
              return `${key === '__proto__' ? `[${keyLiteral}]` : keyLiteral}: ${expression},`;
            })
            .join('\n'),
        })};`,
      },
      elements: standaloneKeys.flatMap(({ elements }) => elements),
    };
  }
}
