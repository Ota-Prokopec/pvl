// Turns a SchemaModel into the class a Compiled Schema is: a subclass of
// `@pvl/schema`'s `Schema` whose single `_checkType` holds every check of
// the whole Schema as straight-line code, nested Schemas inlined rather than
// called (ADR-0023). The emitters write each check; this module decides
// where each one goes.
import type { PossibleLiteralValue } from '@pvl/schema';
import { DIAGNOSTIC_CODE, type DiagnosticCode } from '../../diagnostics/enums.js';
import { SCHEMA_FACTORY, type SchemaFactory } from './enums.js';
import { ArraySchemaEmitter } from './emitters/arraySchemaEmitter.js';
import { BigintSchemaEmitter } from './emitters/bigintSchemaEmitter.js';
import { BooleanSchemaEmitter } from './emitters/booleanSchemaEmitter.js';
import { ChainableSchemaEmitter } from './emitters/chainableSchemaEmitter.js';
import { EnumSchemaEmitter } from './emitters/enumSchemaEmitter.js';
import { LiteralSchemaEmitter } from './emitters/literalSchemaEmitter.js';
import { NumberSchemaEmitter } from './emitters/numberSchemaEmitter.js';
import { ObjectSchemaEmitter, type ObjectEmitTarget } from './emitters/objectSchemaEmitter.js';
import { StringSchemaEmitter } from './emitters/stringSchemaEmitter.js';
import { emitLiteral, js, type EmitTarget, type EmittedCheck } from './emitters/utils.js';
import type { SchemaMethodCall, SchemaModel, StaticValue } from './schemaModel.js';

// The Issue path of a check on the root value: `undefined` at the root, as
// `Issue` itself makes it.
const ROOT_ISSUE_PATH = 'path.length > 0 ? path : undefined' as const;

const INDENT = '  ' as const;

// Every emitter, by the factory whose Schema it compiles. A union has none
// yet, so it is unsupported.
const EMITTER_BY_FACTORY: Readonly<Partial<Record<SchemaFactory, object>>> = {
  [SCHEMA_FACTORY.STRING]: StringSchemaEmitter,
  [SCHEMA_FACTORY.NUMBER]: NumberSchemaEmitter,
  [SCHEMA_FACTORY.BOOLEAN]: BooleanSchemaEmitter,
  [SCHEMA_FACTORY.BIGINT]: BigintSchemaEmitter,
  [SCHEMA_FACTORY.LITERAL]: LiteralSchemaEmitter,
  [SCHEMA_FACTORY.ENUM]: EnumSchemaEmitter,
  [SCHEMA_FACTORY.OBJECT]: ObjectSchemaEmitter,
  [SCHEMA_FACTORY.ARRAY]: ArraySchemaEmitter,
};

// The factories a field or an element may be built with until nested
// composites are compiled (#51).
const FLAT_FACTORIES: ReadonlySet<SchemaFactory> = new Set([
  SCHEMA_FACTORY.STRING,
  SCHEMA_FACTORY.NUMBER,
  SCHEMA_FACTORY.BOOLEAN,
  SCHEMA_FACTORY.BIGINT,
  SCHEMA_FACTORY.LITERAL,
  SCHEMA_FACTORY.ENUM,
]);

const COMPOSITE_FACTORIES: ReadonlySet<SchemaFactory> = new Set([
  SCHEMA_FACTORY.OBJECT,
  SCHEMA_FACTORY.ARRAY,
  SCHEMA_FACTORY.UNION,
]);

type EmitterMethod = (target: EmitTarget, ...args: ReadonlyArray<StaticValue>) => unknown;

// The emitter's static method mirroring the Schema method `name`, or
// `undefined` when there is none, so the method isn't compiled yet. Names
// starting with `_` are the emitter's own hooks, never a chained method.
//
//   findEmitterMethod(StringSchemaEmitter, 'min')    // StringSchemaEmitter.min
//   findEmitterMethod(StringSchemaEmitter, 'refine') // undefined
const findEmitterMethod = (emitter: object, name: string): EmitterMethod | undefined => {
  const method: unknown = Object.hasOwn(emitter, name) ? Reflect.get(emitter, name) : undefined;
  return !name.startsWith('_') && typeof method === 'function'
    ? (method as EmitterMethod)
    : undefined;
};

// Whether `call` is a Shared Modifier that runs before the type check
// (`.optional()`, `.nullable()`), rather than a check after it.
const isPreModifier = (call: SchemaMethodCall): boolean => {
  return findEmitterMethod(ChainableSchemaEmitter, call.name) !== undefined;
};

// What `call`'s emitter method writes for `target`. Only called on a
// SchemaModel findUncompilableReason accepted, so the method and its
// arguments are there.
const emitCall = (emitter: object, call: SchemaMethodCall, target: EmitTarget): unknown => {
  return findEmitterMethod(emitter, call.name)?.(target, ...(call.args ?? []));
};

// Whether an emitter method handed back a check rather than a statement or
// a condition.
const isEmittedCheck = (emitted: unknown): emitted is EmittedCheck => {
  return (
    typeof emitted === 'object' &&
    emitted !== null &&
    typeof Reflect.get(emitted, 'failsWhen') === 'string' &&
    typeof Reflect.get(emitted, 'issue') === 'string'
  );
};

// The check `call` compiles to, such as `.min(3)`'s. Throws when its emitter
// method writes none, which is a bug in an emitter, never a user error.
const emitCallCheck = (
  emitter: object,
  call: SchemaMethodCall,
  target: EmitTarget,
): EmittedCheck => {
  const emitted = emitCall(emitter, call, target);
  if (!isEmittedCheck(emitted)) {
    throw new Error(`The emitter method for .${call.name}() wrote no check.`);
  }
  return emitted;
};

// The source text `call` compiles to: `.optional()`'s condition or
// `.strict()`'s loop. Throws when its emitter method writes none, which is a
// bug in an emitter, never a user error.
const emitCallText = (emitter: object, call: SchemaMethodCall, target: EmitTarget): string => {
  const emitted = emitCall(emitter, call, target);
  if (typeof emitted !== 'string') {
    throw new Error(`The emitter method for .${call.name}() wrote no source text.`);
  }
  return emitted;
};

/** Why a SchemaModel can't be compiled: the diagnostic code and its message. */
export type UncompilableReason = {
  code: DiagnosticCode;
  message: string;
};

// Why a method chained onto a Schema can't be compiled, if it can't.
const findUncompilableCallReason = (
  emitter: object,
  call: SchemaMethodCall,
  isRoot: boolean,
): UncompilableReason | undefined => {
  const isSupported =
    findEmitterMethod(emitter, call.name) !== undefined || (!isRoot && isPreModifier(call));
  if (!isSupported) {
    return {
      code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
      message: `\`.${call.name}()\` on line ${String(call.line)} can't be compiled yet${isRoot && isPreModifier(call) ? ' on the Schema pvl.compile() wraps' : ''}.`,
    };
  }
  return call.args === undefined
    ? {
        code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE,
        message: `The arguments of \`.${call.name}()\` on line ${String(call.line)} aren't literals, so they can't be read statically.`,
      }
    : undefined;
};

// Why a field's or an element's Schema can't be compiled, if it can't.
const findUncompilableChildReason = (schema: SchemaModel): UncompilableReason | undefined => {
  const emitter = EMITTER_BY_FACTORY[schema.factory];
  if (emitter === undefined || !FLAT_FACTORIES.has(schema.factory)) {
    return {
      code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
      message: `The \`pvl.${schema.factory}()\` on line ${String(schema.line)} is nested in a compiled Schema, which can't be compiled yet.`,
    };
  }
  for (const call of schema.calls) {
    const reason = findUncompilableCallReason(emitter, call, false);
    if (reason !== undefined) {
      return reason;
    }
  }
  return undefined;
};

/**
 * Why the Schema a `pvl.compile()` wraps can't be compiled, or `undefined`
 * when it can:
 *
 * - COMPILE_ARGUMENT_NOT_COMPOSITE: it is a primitive, a literal or an enum.
 * - UNSUPPORTED_SCHEMA: it, or a field or element of it, uses what isn't
 *   compiled yet: a nested composite, a union, `.coerce()`, `.refine()`,
 *   `.transform()`, or `.optional()`/`.nullable()` on the wrapped Schema.
 * - COMPILE_ARGUMENT_UNRESOLVABLE: a compiled method's arguments aren't
 *   literals.
 *
 * ```ts
 * pvl.object({ name: pvl.string().min(3) })        // undefined
 * pvl.string()                                     // COMPILE_ARGUMENT_NOT_COMPOSITE
 * pvl.object({ tags: pvl.array(pvl.string()) })   // UNSUPPORTED_SCHEMA
 * pvl.array(pvl.number().refine((n) => n > 0))    // UNSUPPORTED_SCHEMA
 * ```
 */
export const findUncompilableReason = (schema: SchemaModel): UncompilableReason | undefined => {
  if (!COMPOSITE_FACTORIES.has(schema.factory)) {
    return {
      code: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_NOT_COMPOSITE,
      message: `pvl.compile() wraps a \`pvl.${schema.factory}()\` on line ${String(schema.line)}, which isn't an object or an array. Compile the object or array holding it.`,
    };
  }
  const emitter = EMITTER_BY_FACTORY[schema.factory];
  if (emitter === undefined) {
    return {
      code: DIAGNOSTIC_CODE.UNSUPPORTED_SCHEMA,
      message: `The \`pvl.${schema.factory}()\` on line ${String(schema.line)} can't be compiled yet.`,
    };
  }
  for (const call of schema.calls) {
    const reason = findUncompilableCallReason(emitter, call, true);
    if (reason !== undefined) {
      return reason;
    }
  }
  const children =
    schema.factory === SCHEMA_FACTORY.OBJECT
      ? schema.shape.map(({ schema: fieldSchema }) => fieldSchema)
      : schema.factory === SCHEMA_FACTORY.ARRAY
        ? [schema.element]
        : [];
  for (const child of children) {
    const reason = findUncompilableChildReason(child);
    if (reason !== undefined) {
      return reason;
    }
  }
  return undefined;
};

// `text` indented one level deeper, blank lines left blank.
const indent = (text: string): string => {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : `${INDENT}${line}`))
    .join('\n');
};

// A block: `head {`, its body one level deeper, `}`.
const emitBlock = (head: string, body: string): string => {
  return `${head} {\n${indent(body)}\n}`;
};

// `if (fails) { issues.push(issue); }`.
const emitPushIssueIfFails = ({ failsWhen, issue }: EmittedCheck): string => {
  return emitBlock(js`if (${failsWhen})`, js`issues.push(${issue});`);
};

// `if (fails) { issues.push(issue); return { issues }; }`, for the root type
// check that leaves nothing else to check. Through `issues` rather than a
// literal array, which TypeScript would check against Standard Schema's own
// Issue type, which has no `code`.
const emitReturnIssueIfFails = ({ failsWhen, issue }: EmittedCheck): string => {
  return emitBlock(js`if (${failsWhen})`, js`issues.push(${issue});` + '\nreturn { issues };');
};

const RETURN_ISSUES_IF_ANY = emitBlock('if (issues.length > 0)', 'return { issues };');

// The type check of a flat Schema at `target`. Throws for a composite,
// whose type check emitObjectBody or emitArrayBody writes.
const emitTypeCheck = (schema: SchemaModel, target: EmitTarget): EmittedCheck => {
  switch (schema.factory) {
    case SCHEMA_FACTORY.LITERAL:
      return LiteralSchemaEmitter._checkType(target, schema.literalValue);
    case SCHEMA_FACTORY.ENUM:
      return EnumSchemaEmitter._checkType(target, schema.members);
    case SCHEMA_FACTORY.NUMBER:
      return NumberSchemaEmitter._checkType(target);
    case SCHEMA_FACTORY.BOOLEAN:
      return BooleanSchemaEmitter._checkType(target);
    case SCHEMA_FACTORY.BIGINT:
      return BigintSchemaEmitter._checkType(target);
    case SCHEMA_FACTORY.STRING:
      return StringSchemaEmitter._checkType(target);
    default:
      throw new Error(`A pvl.${schema.factory}() can't be inlined as a flat Schema.`);
  }
};

// Every check of a flat field or element at `target`, inlined, each failure
// pushed onto `issues`: the pre-modifiers guard the rest, the type check
// comes next, and the Constraints run in chain order once it has passed.
//
//   if (field0 !== undefined) {
//     if (typeof field0 !== "string") {
//       issues.push({ code: "INVALID_TYPE", … });
//     } else {
//       if (field0.length < 3) {
//         issues.push({ code: "TOO_SMALL", … });
//       }
//     }
//   }
const emitInlineChecks = (schema: SchemaModel, target: EmitTarget): string => {
  const emitter = EMITTER_BY_FACTORY[schema.factory];
  if (emitter === undefined) {
    throw new Error(`A pvl.${schema.factory}() has no emitter.`);
  }
  const continuesWhen = schema.calls
    .filter((call) => isPreModifier(call))
    .map((call) => emitCallText(ChainableSchemaEmitter, call, target));
  const constraintChecks = schema.calls
    .filter((call) => !isPreModifier(call))
    .map((call) => emitCallCheck(emitter, call, target));

  const typeChecked = emitPushIssueIfFails(emitTypeCheck(schema, target));
  const checks =
    constraintChecks.length === 0
      ? typeChecked
      : `${typeChecked} else {\n${indent(constraintChecks.map(emitPushIssueIfFails).join('\n'))}\n}`;
  return continuesWhen.length === 0
    ? checks
    : emitBlock(`if (${continuesWhen.join(' && ')})`, checks);
};

// A key that reads bare in a comment or a type.
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

// How a key reads in a comment or a type: bare when it is an identifier,
// quoted otherwise.
//
//   formatKey('name')   // 'name'
//   formatKey('e-mail') // '"e-mail"'
const formatKey = (key: string): string => {
  return IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
};

// The statement putting a passed field's value on `output`. A field that may
// be `undefined` (it is `.optional()`) is left off when its key was omitted,
// and `__proto__` is defined rather than assigned, which would reparent
// `output` instead.
const emitOutputAssignment = (key: string, schema: SchemaModel, value: string): string => {
  const keyLiteral = JSON.stringify(key);
  const assignment =
    key === '__proto__'
      ? js`Object.defineProperty(output, ${keyLiteral}, { value: ${value}, writable: true, enumerable: true, configurable: true });`
      : js`output[${keyLiteral}] = ${value};`;
  const mayBeUndefined = schema.calls.some((call) => call.name === 'optional');
  return mayBeUndefined
    ? emitBlock(js`if (${value} !== undefined || Object.hasOwn(input, ${keyLiteral}))`, assignment)
    : assignment;
};

// The last of `.strict()` and `.passthrough()` chained onto an object, which
// wins, since each removes the other; `undefined` means it strips.
const findUnknownKeysCall = (
  calls: ReadonlyArray<SchemaMethodCall>,
): SchemaMethodCall | undefined => {
  return [...calls].reverse().find((call) => call.name === 'strict' || call.name === 'passthrough');
};

// The body of an object's `_checkType`: the type check, every field's checks
// inlined in shape order, then the unknown-keys handling the last of
// `.strict()`/`.passthrough()` chose (stripping when neither was chained),
// then the output built from the fields that passed.
const emitObjectBody = (schema: Extract<SchemaModel, { factory: 'object' }>): string => {
  const rootTarget: EmitTarget = { value: 'value', path: ROOT_ISSUE_PATH };
  const declaredKeys = schema.shape.map(({ key }) => key);
  const objectTarget: ObjectEmitTarget = { value: 'input', path: 'path', declaredKeys };
  const unknownKeysCall = findUnknownKeysCall(schema.calls);

  const fieldChecks = schema.shape.map(({ key, schema: fieldSchema }, index) => {
    const value = `field${String(index)}`;
    return [
      `// ${formatKey(key)}`,
      js`const ${value} = input[${JSON.stringify(key)}];`,
      emitInlineChecks(fieldSchema, { value, path: js`[...path, ${JSON.stringify(key)}]` }),
      '',
    ].join('\n');
  });
  const strictChecks =
    unknownKeysCall?.name === 'strict'
      ? [emitCallText(ObjectSchemaEmitter, unknownKeysCall, objectTarget), RETURN_ISSUES_IF_ANY]
      : [];
  const outputAssignments = schema.shape.map(({ key, schema: fieldSchema }, index) =>
    emitOutputAssignment(key, fieldSchema, `field${String(index)}`),
  );
  const passthroughCopy =
    unknownKeysCall?.name === 'passthrough'
      ? [emitCallText(ObjectSchemaEmitter, unknownKeysCall, objectTarget)]
      : [];

  return [
    'const issues: PvlIssue[] = [];',
    emitReturnIssueIfFails(ObjectSchemaEmitter._checkType(rootTarget)),
    'const input = value as Record<string, unknown>;',
    '',
    ...fieldChecks,
    RETURN_ISSUES_IF_ANY,
    ...strictChecks,
    'const output: Record<string, unknown> = {};',
    ...outputAssignments,
    ...passthroughCopy,
    'return { value: output };',
  ].join('\n');
};

// The body of an array's `_checkType`: the type check, one loop with the
// element's checks inlined, then the array's own Constraints in chain order.
const emitArrayBody = (schema: Extract<SchemaModel, { factory: 'array' }>): string => {
  const rootTarget: EmitTarget = { value: 'value', path: ROOT_ISSUE_PATH };
  const constraintChecks = schema.calls.map((call) =>
    emitCallCheck(ArraySchemaEmitter, call, rootTarget),
  );
  return [
    'const issues: PvlIssue[] = [];',
    emitReturnIssueIfFails(ArraySchemaEmitter._checkType(rootTarget)),
    'const output: unknown[] = [];',
    emitBlock(
      'for (let index = 0; index < value.length; index++)',
      [
        'const element: unknown = value[index];',
        emitInlineChecks(schema.element, { value: 'element', path: '[...path, index]' }),
        'output.push(element);',
      ].join('\n'),
    ),
    RETURN_ISSUES_IF_ANY,
    ...(constraintChecks.length === 0
      ? []
      : [...constraintChecks.map(emitPushIssueIfFails), RETURN_ISSUES_IF_ANY]),
    'return { value: output };',
  ].join('\n');
};

/** A Schema's `Input` and `Output` types, spelled as TypeScript. */
export type SchemaTypes = {
  input: string;
  output: string;
};

// `type` with `| undefined` or `| null` added for each `.optional()` and
// `.nullable()`, in chain order.
const addPreModifierTypes = (type: string, calls: ReadonlyArray<SchemaMethodCall>): string => {
  return calls.reduce(
    (widened, call) =>
      call.name === 'optional'
        ? `${widened} | undefined`
        : call.name === 'nullable'
          ? `${widened} | null`
          : widened,
    type,
  );
};

// A literal value's type: `"a"`, `1`, `10n`, `true`. `-0` types as `0`, as
// TypeScript infers it.
const spellLiteralType = (literalValue: PossibleLiteralValue): string => {
  return typeof literalValue === 'number' ? String(literalValue) : emitLiteral(literalValue);
};

// An object type from its fields, each key already marked `?` when optional.
//
//   [{ key: 'name', type: 'string' }, { key: 'age?', type: 'number | undefined' }]
//   // '{ name: string; age?: number | undefined }'
//   [] // '{}'
const spellObjectType = (fields: ReadonlyArray<{ key: string; type: string }>): string => {
  return fields.length === 0
    ? '{}'
    : `{ ${fields.map(({ key, type }) => `${key}: ${type}`).join('; ')} }`;
};

// An array type of `elementType`, parenthesised when it is a union.
//
//   'string'        // 'string[]'
//   'string | null' // '(string | null)[]'
const spellArrayType = (elementType: string): string => {
  return elementType.includes(' ') ? `(${elementType})[]` : `${elementType}[]`;
};

/**
 * The `Input` and `Output` types of a compilable SchemaModel, spelled as
 * the interpreted Schema's own inferred types are, so the Compiled Schema
 * types identically.
 *
 * ```ts
 * pvl.object({ name: pvl.string(), age: pvl.number().optional() })
 * // { input: '{ name: string; age?: number | undefined }', output: <the same> }
 * pvl.array(pvl.enum(['A', 'B']).nullable()).min(1)
 * // { input: '("A" | "B" | null)[]', output: <the same> }
 * ```
 */
export const emitSchemaTypes = (schema: SchemaModel): SchemaTypes => {
  switch (schema.factory) {
    case SCHEMA_FACTORY.OBJECT: {
      const fields = schema.shape.map(({ key, schema: fieldSchema }) => {
        const { input, output } = emitSchemaTypes(fieldSchema);
        const optionalMark = fieldSchema.calls.some((call) => call.name === 'optional') ? '?' : '';
        return { key: `${formatKey(key)}${optionalMark}`, input, output };
      });
      const input = spellObjectType(fields.map(({ key, input: type }) => ({ key, type })));
      const output = spellObjectType(fields.map(({ key, output: type }) => ({ key, type })));
      // `.passthrough()` widens the type for good, even under a later
      // `.strict()`, as `ObjectSchema`'s own types do.
      const hasPassthrough = schema.calls.some((call) => call.name === 'passthrough');
      return { input, output: hasPassthrough ? `${output} & Record<string, unknown>` : output };
    }
    case SCHEMA_FACTORY.ARRAY: {
      const { input, output } = emitSchemaTypes(schema.element);
      return { input: spellArrayType(input), output: spellArrayType(output) };
    }
    default: {
      const baseType =
        schema.factory === SCHEMA_FACTORY.LITERAL
          ? spellLiteralType(schema.literalValue)
          : schema.factory === SCHEMA_FACTORY.ENUM
            ? schema.members.map((member) => spellLiteralType(member)).join(' | ')
            : schema.factory;
      const type = addPreModifierTypes(baseType, schema.calls);
      return { input: type, output: type };
    }
  }
};

/** What {@link emitCompiledSchema} writes a class for. */
export type EmitCompiledSchemaArgs = {
  /** A SchemaModel {@link findUncompilableReason} accepted. */
  schema: SchemaModel;
  className: string;
  /** The line of the `pvl.compile()` call, named in the class's comment. */
  line: number;
};

/**
 * The class declaration a Compiled Schema is, extending `PvlSchema` (see
 * `COMPILED_SCHEMA_IMPORT`) with every check inlined in `_checkType`.
 *
 * ```ts
 * emitCompiledSchema({ schema: <pvl.object({ name: pvl.string() })>, className: 'PvlCompiledSchema0', line: 3 })
 * // // pvl.compile() on line 3
 * // class PvlCompiledSchema0 extends PvlSchema<{ name: string }, { name: string }> {
 * //   override _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> { … }
 * // }
 * ```
 */
export const emitCompiledSchema = ({ schema, className, line }: EmitCompiledSchemaArgs): string => {
  const { input, output } = emitSchemaTypes(schema);
  const body =
    schema.factory === SCHEMA_FACTORY.OBJECT
      ? emitObjectBody(schema)
      : schema.factory === SCHEMA_FACTORY.ARRAY
        ? emitArrayBody(schema)
        : '';
  return [
    `// pvl.compile() on line ${String(line)}`,
    emitBlock(
      `class ${className} extends PvlSchema<${input}, ${output}>`,
      emitBlock(
        'override _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown>',
        body,
      ),
    ),
  ].join('\n');
};
