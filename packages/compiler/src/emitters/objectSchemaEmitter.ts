// The code an `ObjectSchema` compiles to, one method per method of
// `ObjectInterpretedSchema` it mirrors, and the composite parts of a compiled
// object, at the root or nested in another Schema, which inline every
// field's checks, nested objects' and arrays' included. As in
// `ObjectInterpretedSchema`, `.strict()` is a post-modifier reading the
// keys the shape declares, and `.passthrough()` writes none: the output
// keeps the undeclared keys once the strip it removes is gone.
import {
  ISSUE_CODE,
  OBJECT_SCHEMA_ISSUE_MESSAGE,
  type CheckOptions,
  type ObjectInterpretedSchema,
} from '@pcvl/schema';
import type { ObjectSchema } from '../schemas/objectSchema.js';
import type { ObjectField } from '../schemas/types/schemaOptions.js';
import type { RuntimeArgument } from '../runtimeArgument/runtimeArgument.js';
import type { SchemaTypes, SpelledType } from '../spelledType/types.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmittedCheck, EmittedIssue, EmittedOutputStatement } from './types/emittedText.js';
import type {
  EmitSchemaCompositePartsArgs,
  EmitShapePropertyArgs,
  SpellTypesArgs,
} from './types/hookArgs.js';
import type {
  EmitterMethodOf,
  ParameterTypesOf,
  PostModifierStepTable,
} from './types/methodTables.js';
import type {
  CompositeLocalVariableNames,
  EmittedPostModifierStep,
  SchemaCompositeParts,
} from './types/schemaParts.js';
import type { EmittedStandaloneProperty } from './types/standaloneProperties.js';
import {
  emitCheck,
  emitOutputStatement,
  emitTypeCheck,
  emitVariableDeclaration,
} from './utils/emittedText.js';
import { composeBlock, js } from './utils/js.js';
import type { EmitBaseCheckArgs } from './schemaEmitter.js';
import { emitConstraintIssue, emitMessageAroundValue } from '../issue/utils.js';
import { CHECK_OPTIONS_TYPE_STRING } from './consts/checkOptions.js';
import type { Scope } from '../scope.js';
import { PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM } from '@pcvl/schema';
import { UNDEFINEDNESS } from '../spelledType/enums.js';
import { UNKNOWN_KEYS_MODE } from '../schemas/enums.js';

// A key that reads bare in a comment or a type.
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

/** The `@pcvl/schema` object whose methods `ObjectSchemaEmitter`'s mirror, whatever its shape. */
type PvlAnyObjectSchema = ObjectInterpretedSchema;

/** A field of the shape, with the name its value is read into: `field0`, `field1`, … */
export type NamedObjectField = ObjectField & {
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
const nameFields = (shape: ReadonlyArray<ObjectField>, scope: Scope): NamedObjectField[] => {
  return shape.map((field) => ({ ...field, value: scope.nextField() }));
};

/**  The condition under which the runtime `key` isn't one the shape declares.
  - `if` statement with "&&" used to speed up the process ([].includes("key") would need to allocate a new array)
  ```ts
   ['name', 'age'] // 'key !== "name" && key !== "age"'
   []              // 'true'
  ```
*/
const emitKeyValueNotInluded = (declaredKeys: ReadonlyArray<string>): string => {
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
  options: CheckOptions | RuntimeArgument | undefined,
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
 * mapped type, as `@pcvl/schema`'s own `ObjectOutput` flattens its parts, so
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

/** What {@link emitFieldChecks} emits a field's checks for: the field, named, and its object's locals. */
export type EmitFieldChecksArgs = {
  field: NamedObjectField;
  locals: CompositeLocalVariableNames;
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
 * emitOutputAssignment({ field: { key: 'name', schema: <pvl.string()>, value: 'field0' }, locals: <locals ending in 1> })
 * // 'output1["name"] = field0;'
 * emitOutputAssignment({ field: { key: 'age', schema: <pvl.number().optional()>, value: 'field1' }, locals: <the same> })
 * // 'if (field1 !== undefined || Object.hasOwn(input1, "age")) {\n  output1["age"] = field1;\n}'
 * ```
 */
const emitOutputAssignment = ({
  field: { key, schema: fieldSchema, value },
  locals: { input, output },
}: {
  field: NamedObjectField;
  locals: CompositeLocalVariableNames;
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
            head: js`if (${value} !== undefined || Object.hasOwn(${input}, ${keyLiteral}))`, // omitted value in object stays omitted (rather then being set to "undefined")
            body: assignment,
          })
        : assignment,
  });
};

/** What {@link emitUnknownKeysCopy} reads an object's keys with: the keys its shape declares, and its locals. */
export type UnknownKeysArgs = {
  declaredKeys: ReadonlyArray<string>;
  locals: CompositeLocalVariableNames;
};

/**
 * `.strict()`, reading the keys the shape declares and the object's `input`
 * and path locals, as `ObjectInterpretedSchema`'s closes over its shape's
 * keys: an `UNRECOGNIZED_KEY` Issue per key of `input` the shape doesn't
 * declare. It reads `input` rather than its target, the output, which holds
 * the unknown keys only when another post-modifier reads them
 * (`_emitSchemaCompositeParts`). Throws without `compositeLocals`, which an
 * object, a composite, always has.
 *
 * ```ts
 * for (const key of Object.keys(input)) {
 *   if (key !== "name") {
 *     issues.push({ code: "UNRECOGNIZED_KEY", message: `Unrecognized key "${key}"`, path: [...path, key] });
 *   }
 * }
 * ```
 */
const strict: EmitterMethodOf<
  PvlAnyObjectSchema['strict'],
  EmittedPostModifierStep,
  ObjectSchema
> = ({ schema: { declaredKeys }, compositeLocals, args: [options] }) => {
  if (compositeLocals === undefined) {
    throw new Error("ObjectSchemaEmitter has no composite locals to check an object's keys with.");
  }
  const { input, path } = compositeLocals;
  return {
    check: emitCheck({
      loopHead: js`for (const key of Object.keys(${input}))`,
      failsWhen: emitKeyValueNotInluded(declaredKeys),
      issue: emitUnrecognizedKeyIssue(path, options),
    }),
  };
};

/**
 * `.passthrough()` → nothing: it only removes the strip, so
 * `_emitSchemaCompositeParts` copies the undeclared keys onto the output
 * once it wins (`unknownKeysMode`), as `_checkType` keeps them.
 */
const passthrough: EmitterMethodOf<PvlAnyObjectSchema['passthrough'], undefined> = () => undefined;

/**
 * Copies every key of `input` the shape doesn't declare onto `output`,
 * after the declared ones, as `_checkType` keeps them once `.strict()` or
 * `.passthrough()` removed the strip. `__proto__` is defined rather than
 * assigned, which would reparent `output` instead.
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
const emitUnknownKeysCopy = ({
  declaredKeys,
  locals: { input, output },
}: UnknownKeysArgs): EmittedOutputStatement =>
  emitOutputStatement({
    statement: js`for (const key of Object.keys(${input})) {
      if (${emitKeyValueNotInluded(declaredKeys)}) {
        if (key === "__proto__") {
          Object.defineProperty(${output}, key, { value: ${input}[key], writable: true, enumerable: true, configurable: true });
        } else {
          ${output}[key] = ${input}[key];
        }
      }
    }`,
  });

export class ObjectSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly postModifierSteps = {
    ...ChainableSchemaEmitter.postModifierSteps,
    strict,
    passthrough,
  } satisfies PostModifierStepTable<ObjectSchema>;

  public static override readonly parameterTypes: ParameterTypesOf<PvlAnyObjectSchema> = {
    strict: [CHECK_OPTIONS_TYPE_STRING],
    passthrough: [],
  };

  /** `typeof value !== "object" || value === null || Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitTypeCheck({
      failsWhen: js`typeof ${value} !== "object" || ${value} === null || Array.isArray(${value})`,
      message: OBJECT_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }

  /**
   * An object's composite parts, at the root or nested in another Schema:
   * its locals, every field's checks inlined in shape order as its
   * children, and the output built from the fields. Like `_checkType`, it
   * strips by never copying the keys the shape doesn't declare, and copies
   * them after the declared fields once `.strict()` or `.passthrough()`
   * removed the strip (`unknownKeysMode`), unless nothing can read them.
   * The frame hands the output on.
   *
   * ```ts
   * ObjectSchemaEmitter._emitSchemaCompositeParts({ schema: <pvl.object({ name: pvl.string() }).strict()>, target: <field0 at [...path1, "user"]>, scope })
   * // { locals: <locals ending in 2>, declarations: ['const input2 = field0 as Record<string, unknown>;'],
   * //   childChecks: ['// name\nconst field1 = input2["name"];\nif (typeof field1 !== "string") { … path: [...path2, "name"] … }'], setsChildrenApart: true,
   * //   outputStatements: ['const output2: Record<string, unknown> = {};', 'output2["name"] = field1;'] }
   * ```
   */
  protected static override _emitSchemaCompositeParts({
    schema,
    target,
    scope,
  }: EmitSchemaCompositePartsArgs<ObjectSchema>): SchemaCompositeParts {
    // Numbered first, so before its fields and any Schema nested in them.
    const locals: CompositeLocalVariableNames = scope.nextCompositeLocals();
    const fields = nameFields(schema.shape, scope);
    const { unknownKeysMode } = schema;
    // Kept as `_checkType` keeps them once the strip is removed. A `.strict()`
    // with no other post-modifier reading the output skips the copy, which
    // nothing can observe: with an unknown key it fails, so the output is
    // never accepted, and without one there is nothing to copy. Its check
    // reads `input` for that reason (`strict`).
    const copiesUnknownKeys =
      unknownKeysMode === UNKNOWN_KEYS_MODE.PASSTHROUGH ||
      (unknownKeysMode === UNKNOWN_KEYS_MODE.STRICT && schema.readsUnknownKeysAfterStrict);

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
        ...fields.map((field) => emitOutputAssignment({ field, locals })),
        ...(copiesUnknownKeys
          ? [emitUnknownKeysCopy({ declaredKeys: schema.declaredKeys, locals })]
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
      .some((call) => call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.PASSTHROUGH);
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
   * ObjectSchemaEmitter._emitShapeProperty({ schema: <pvl.object({ name: pvl.string().standalone(), age: pvl.number() })>, className: 'PvlCompiledSchema0' })
   * // { type: '{ readonly shape: { readonly name: PvlSchema<string, string> & PvlStandaloneMarker } }', declaration: 'readonly shape: { … };', statement: 'this.shape = {\n  "name": (new (class PvlCompiledSchema0_0 …)() as …),\n};' }
   * ObjectSchemaEmitter._emitShapeProperty({ schema: <pvl.object({ age: pvl.number() })>, … })
   * // { type: '{ readonly shape: {} }', declaration: 'readonly shape: {} = {};', statement: undefined }
   * ```
   */
  protected static override _emitShapeProperty({
    schema,
    className,
  }: EmitShapePropertyArgs<ObjectSchema>): EmittedStandaloneProperty {
    const standaloneKeys = schema.shape.flatMap(({ key, schema: fieldSchema }, index) =>
      fieldSchema.isStandalone
        ? [
            {
              key,
              ...fieldSchema.emitter.emitStandaloneCompiledSchema({
                schema: fieldSchema,
                className: js`${className}_${String(index)}`,
              }),
            },
          ]
        : [],
    );
    if (standaloneKeys.length === 0) {
      return {
        type: '{ readonly shape: {} }',
        declaration: 'readonly shape: {} = {};',
        statement: undefined,
      };
    }
    const shapeType = js`{ ${standaloneKeys.map(({ key, type }) => js`readonly ${formatKey(key)}: ${type}`).join('; ')} }`;
    return {
      type: js`{ readonly shape: ${shapeType} }`,
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
    };
  }
}
