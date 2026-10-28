// The differential test: every case in `DIFFERENTIAL_CASES` compiled,
// validating generated inputs as the interpreted path does and typing as
// `pvl.compile()` does under strict TypeScript.
import * as path from 'node:path';
import fc from 'fast-check';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { runCompilation } from '../src/index.js';
import {
  configJson,
  createFixture,
  describeResult,
  type CompiledFixture,
  linkSchemaPackage,
  readFixtureFile,
  schemaFile,
  type SchemasModule,
} from './helpers.js';

// Every Schema the differential test compiles, by export name: each feature
// of an object or array at least once, alone, combined and nested, each
// primitive, literal and enum at the root, `.optional()`/`.nullable()` on a
// root of each kind, and an Imported Schema nested and chained onto.
const DIFFERENTIAL_CASES: Readonly<Record<string, string>> = {
  everyPrimitive: [
    'pvl.object({',
    '  name: pvl.string().min(2).max(5),',
    '  code: pvl.string().length(2),',
    '  age: pvl.number().int().min(0).max(120).optional(),',
    '  admin: pvl.boolean().nullable(),',
    '  id: pvl.bigint().min(1n).max(100n),',
    "  kind: pvl.literal('user'),",
    "  role: pvl.enum(['ADMIN', 'USER']),",
    '})',
  ].join('\n'),
  strict: "pvl.object({ name: pvl.string(), role: pvl.enum({ A: 'a', B: 1 }) }).strict()",
  strictWithMessage: "pvl.object({ name: pvl.string() }).strict({ message: 'no extras' })",
  passthrough: 'pvl.object({ name: pvl.string().optional() }).passthrough()',
  passthroughThenStrict: 'pvl.object({ name: pvl.string() }).passthrough().strict()',
  strictThenPassthrough: 'pvl.object({ name: pvl.string() }).strict().passthrough()',
  strictReplacedAfterRefine:
    "pvl.object({ name: pvl.string() }).strict().refine((value) => value.name !== 'a').strict({ message: 'extra' })",
  empty: 'pvl.object({})',
  integerKeys: 'pvl.object({ b: pvl.string(), 1: pvl.number(), 0: pvl.boolean() })',
  duplicateEnumMembers: "pvl.array(pvl.enum(['A', 'A', 'B']))",
  customMessages: [
    'pvl.object({',
    "  name: pvl.string().min(3, { message: 'too short' }).max(4, { message: '' }),",
    "  count: pvl.number().int({ message: 'whole' }).min(-1, { message: 'low' }),",
    "  'e-mail': pvl.string().nullable().optional(),",
    "  ['__proto__']: pvl.string().optional(),",
    '})',
  ].join('\n'),
  literals: [
    'pvl.object({',
    '  one: pvl.literal(1),',
    '  negativeZero: pvl.literal(-0).optional(),',
    '  big: pvl.literal(1n).optional(),',
    '  yes: pvl.literal(true).optional(),',
    '})',
  ].join('\n'),
  constants: 'pvl.object({ name, age: pvl.number().max(MAX) })',
  unaryOperators: [
    'pvl.object({',
    '  yes: pvl.literal(!0),',
    '  admin: pvl.literal(!!!1).optional(),',
    "  name: pvl.string().min(+'2').max(+5),",
    '  count: pvl.number().min(-+1).max(+MAX).optional(),',
    '})',
  ].join('\n'),
  strings: 'pvl.array(pvl.string().min(1)).min(1).max(3)',
  optionalNumbers: 'pvl.array(pvl.number().optional()).length(2)',
  nullableEnums: "pvl.array(pvl.enum(['A', 'B']).nullable())",
  bigints: 'pvl.array(pvl.literal(1n))',
  arrayMessages: "pvl.array(pvl.boolean()).min(2, { message: '' }).max(3, { message: 'too many' })",
  nestedObjects: [
    'pvl.object({',
    '  name: pvl.string(),',
    '  inner: pvl.object({ name: pvl.string().min(2), inner: pvl.object({ age: pvl.number() }).strict() }),',
    '  list: pvl.object({ name: pvl.string() }).passthrough().optional(),',
    '})',
  ].join('\n'),
  arrayOfObjects:
    "pvl.array(pvl.object({ name: pvl.string(), list: pvl.array(pvl.number().int()).min(1) }).strict({ message: 'extra' })).max(3)",
  arrayOfArrays: 'pvl.array(pvl.array(pvl.boolean()).length(2).nullable()).min(1)',
  objectOfArrays:
    'pvl.object({ list: pvl.array(pvl.object({ inner: pvl.array(pvl.string()) })), inner: pvl.array(pvl.number()).max(2).optional() })',
  rootString: 'pvl.string().min(1).max(2)',
  rootNumber: "pvl.number().int({ message: 'whole' }).min(0).max(120)",
  rootBoolean: 'pvl.boolean()',
  rootBigint: 'pvl.bigint().min(1n).max(100n)',
  rootLiteral: "pvl.literal('user')",
  rootEnum: "pvl.enum({ A: 'a', B: 1 })",
  optionalString: "pvl.string().max(2, { message: 'long' }).optional()",
  nullableNumber: 'pvl.number().min(0).nullable()',
  nullableOptionalString: 'pvl.string().min(1).nullable().optional()',
  optionalObject: 'pvl.object({ name: pvl.string() }).strict().optional()',
  nullableObject: 'pvl.object({ age: pvl.number().optional() }).passthrough().nullable()',
  optionalNullableObject: 'pvl.object({ name: pvl.string().min(2) }).optional().nullable()',
  optionalArray: 'pvl.array(pvl.string()).min(1).optional()',
  nullableArray: 'pvl.array(pvl.object({ name: pvl.string() })).nullable()',
  nullableOptionalArray: 'pvl.array(pvl.boolean().nullable()).max(2).nullable().optional()',
  runtimeArguments: [
    'pvl.object({',
    '  name: pvl.string().min(LIMIT - 3).max(LIMIT, OPTIONS),',
    '  count: pvl.number().int({ message: getMessage() }).max(LIMIT * 10),',
    '  big: pvl.bigint().max(BigInt(LIMIT)).optional(),',
    '  list: pvl.array(pvl.boolean()).length(LIMIT - 2, { message: emptyMessage() }).optional(),',
    '}).strict(OPTIONS)',
  ].join('\n'),
  hoistedRuntimeArgument: 'hoistedBase.min(LIMIT - 2)',
  refinedString:
    "pvl.string().refine((value) => value.length !== 1, { message: 'one' }).max(4).refine(isNotUser).optional()",
  refinedStrippedObject:
    'pvl.object({ name: pvl.string().refine(isNotUser) }).refine((value) => Object.keys(value).length === 1)',
  refinedStrictObject: [
    'pvl.object({ name: pvl.string() })',
    "  .refine((value) => Object.keys(value).length < 2, { message: 'keys' })",
    '  .strict()',
    "  .refine((value) => value.name !== 'a', OPTIONS)",
    '  .nullable()',
  ].join('\n'),
  refinedPassthroughObject:
    'pvl.object({ name: pvl.string().optional() }).passthrough().refine((value) => value.extra !== 1)',
  coercedFields: [
    'pvl.object({',
    '  name: pvl.string().optional().coerce(),',
    '  code: pvl.string().coerce().optional(),',
    '  age: pvl.number().coerce().int().max(MAX),',
    '  admin: pvl.boolean().coerce().nullable(),',
    '  id: pvl.bigint().coerce().min(1n),',
    '  one: pvl.literal(1).coerce(),',
    "  kind: pvl.literal('user').coerce().optional(),",
    '  yes: pvl.literal(true).coerce().optional(),',
    '  big: pvl.literal(1n).nullable().coerce().optional(),',
    '})',
  ].join('\n'),
  coercedArray: 'pvl.array(pvl.number().coerce().nullable()).optional()',
  rootCoercedNumber: 'pvl.number().coerce().min(0)',
  rootCoercedBigint: 'pvl.bigint().optional().coerce()',
  rootTransform: 'pvl.string().min(1).refine(isNotUser).transform((value) => value.length)',
  transformedFields: [
    'pvl.object({',
    "  name: pvl.string().optional().transform((value) => value ?? 'none'),",
    '  age: pvl.number().transform((value) => (value > 3 ? value : undefined)),',
    "  code: pvl.string().coerce().transform((value) => (value === 'undefined' ? undefined : value)),",
    '  kind: pvl.string().optional().transform((value) => value),',
    '  list: pvl.array(pvl.string().coerce().transform((value) => value.length)).optional(),',
    '})',
  ].join('\n'),
  transformedObject: [
    'pvl.object({ name: pvl.string().transform((value) => value.length) })',
    '  .strict()',
    '  .refine((value) => value.name !== 1)',
    '  .nullable()',
    "  .transform((value) => (value === null ? 'none' : [value.name]))",
  ].join('\n'),
  transformedArray:
    "pvl.array(pvl.number()).max(2).optional().transform((value) => value?.join(','))",
  unboundFunctions: [
    'pvl',
    '  .string()',
    '  .refine(function (this: unknown) {',
    '    return this === undefined;',
    '  })',
    '  .transform(function (this: unknown, value) {',
    '    return [value, typeof this];',
    '  })',
  ].join('\n'),
  refinedArray:
    "pvl.array(pvl.object({ name: pvl.string() })).min(1).refine((value) => value.length !== 2, { message: '' })",
  standaloneKeys: [
    'pvl.object({',
    '  name: pvl.string().min(LIMIT - 3).max(LIMIT).standalone(),',
    '  age: pvl.number().int(),',
    '  inner: pvl.object({ name: pvl.string().min(2).standalone(), code: pvl.string() }).strict().optional().standalone(),',
    '  list: pvl.array(pvl.number().max(LIMIT)).min(1).standalone(),',
    '  tags: pvl.array(pvl.object({ kind: pvl.literal(1).standalone() }).standalone()).standalone(),',
    '  count: pvl.string().transform((value) => value.length).standalone(),',
    "  'e-mail': pvl.compile(pvl.string().refine(isNotUser)).standalone(),",
    "  ['__proto__']: pvl.compile(pvl.boolean().standalone()),",
    '})',
  ].join('\n'),
  standaloneTransformedObject:
    'pvl.object({ name: pvl.string().max(LIMIT).standalone() }).transform((value) => value.name)',
  standaloneElement:
    'pvl.array(pvl.object({ name: pvl.string().min(1).standalone() }).standalone()).max(3)',
  standaloneRoot: 'pvl.string().min(1).standalone()',
  // `.standalone()` keeps the chain going, so Modifiers can follow it.
  standaloneMidChain: [
    'pvl.object({',
    '  name: pvl.string().standalone().min(2).optional(),',
    '  inner: pvl.object({ code: pvl.string().standalone().max(LIMIT) }).standalone().strict(),',
    '  list: pvl.array(pvl.number().standalone().int()).standalone().min(1),',
    '  count: pvl.string().standalone().transform((value) => value.length),',
    '})',
  ].join('\n'),
  importedSchema:
    'pvl.object({ owner: sharedUser, list: pvl.array(sharedUser.nullable()).max(2) })',
};

// The file the Imported Schema case reads, outside `include`, importing `pvl`
// under a Local Name of its own.
const SHARED_FILE = [
  "import { pvl as p } from '@pvl/schema';",
  '',
  "export const sharedUser = p.object({ name: p.string().min(2), role: p.enum(['ADMIN', 'USER']).optional() }).strict();",
  '',
].join('\n');

// An interpreted object whose fields are Compiled Schemas, so their Issues
// are reported under the parent's path, one of them marked `.standalone()`
// once compiled, so the parent's `shape` holds it.
const INTERPRETED_PARENT =
  'pvl.object({ inner: pvl.compile(pvl.object({ name: pvl.string().standalone() }).strict()).standalone(), list: pvl.compile(pvl.array(pvl.number()).min(1)) })' as const;

// The scanned file the differential test compiles: every case, exported
// compiled, the interpreted parent, the constants one case reads, the
// Imported Schema one case nests, and the values the Runtime Argument cases
// evaluate, one of them in a const a case follows.
const DIFFERENTIAL_FILE = schemaFile(
  [
    "import { sharedUser } from '../shared/user.js';",
    'const MAX = 9;',
    'const name = pvl.string().min(2);',
    'let LIMIT = 4;',
    "const getMessage = (): string => 'from a call';",
    "const emptyMessage = (): string => '';",
    'const OPTIONS = { message: getMessage() };',
    'const hoistedBase = pvl.string().max(LIMIT + 1);',
    "const isNotUser = (value: string): boolean => value !== 'user';",
    ...Object.entries(DIFFERENTIAL_CASES).map(
      ([exportName, source]) => `export const ${exportName} = pvl.compile(${source});`,
    ),
    `export const interpretedParent = ${INTERPRETED_PARENT};`,
  ].join('\n'),
);

// The keys any case declares, plus one none does, so generated objects hit
// declared, missing and unknown keys alike.
const KEYS = [
  'b',
  '0',
  '1',
  'inner',
  'list',
  'tags',
  'name',
  'code',
  'age',
  'admin',
  'id',
  'kind',
  'role',
  'owner',
  'count',
  'e-mail',
  '__proto__',
  'one',
  'negativeZero',
  'big',
  'yes',
  'extra',
];

// Values near every boundary and member the cases check.
const primitiveValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 6 }),
  fc.integer({ min: -3, max: 125 }),
  fc.double(),
  fc.bigInt({ min: -5n, max: 150n }),
  fc.boolean(),
  fc.constantFrom(null, undefined, 'user', 'ADMIN', 'USER', 'a', 'A', 'B', 1, 0, -0, 1n, true),
);

// A primitive, or an object or array a few levels deep built of them, so the
// nested cases are hit at every depth.
const { fieldValue } = fc.letrec<{ fieldValue: unknown }>((tie) => ({
  fieldValue: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    primitiveValue,
    fc.dictionary(fc.constantFrom(...KEYS), tie('fieldValue'), { maxKeys: 4 }),
    fc.array(tie('fieldValue'), { maxLength: 3 }),
  ),
}));

const validatedValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.dictionary(fc.constantFrom(...KEYS), fieldValue),
  fc.record(Object.fromEntries(KEYS.map((key) => [key, fieldValue])), { requiredKeys: [] }),
  fc.array(fieldValue, { maxLength: 4 }),
  fc.anything({ withBigInt: true }),
);

// An object whose `inner` and `list` hit the interpreted parent's compiled
// fields with values near what they accept.
const parentValue: fc.Arbitrary<unknown> = fc.record(
  {
    inner: fc.oneof(fc.dictionary(fc.constantFrom('name', 'extra'), fieldValue), fieldValue),
    list: fc.oneof(fc.array(fieldValue, { maxLength: 3 }), fieldValue),
  },
  { requiredKeys: [] },
);

/** A Schema's `shape` and `element`, either of which it may lack, as may an absent Schema. */
type SchemaStructure = {
  shape?: Readonly<Record<string, SchemasModule[string]>>;
  element?: SchemasModule[string];
};

/** The {@link SchemaStructure} `schema` holds at runtime, typed or not. */
const readStructure = (schema: SchemasModule[string] | undefined): SchemaStructure =>
  (schema ?? {}) as SchemaStructure;

/**
 * Every Schema the compiled `compiled` exposes through `shape` and
 * `element`, at any depth, by the path it is read at
 * (`shape.inner.shape.name`), itself at `''`, beside the one the
 * interpreted `interpreted` holds at that path, `undefined` where it holds
 * none: what both must expose, and validate alike. Walked from the compiled
 * side, as an interpreted transformed object or array is a clone of the one
 * `.transform()` was called on, so it still holds a `shape` or `element` at
 * runtime that its type doesn't expose (ADR-0016). The type check below
 * asserts the exposed types identical.
 */
const findExposedSchemas = (
  compiled: SchemasModule[string],
  interpreted: SchemasModule[string] | undefined,
  at = '',
): Array<[string, SchemasModule[string], SchemasModule[string] | undefined]> => {
  const { shape, element } = readStructure(compiled);
  const interpretedStructure = readStructure(interpreted);
  return [
    [at, compiled, interpreted],
    // `shape` itself, owned by `compiled`, so an object with no Standalone Key must have `{}` on both sides.
    ...(shape === undefined
      ? []
      : [
          [
            `${at}.shape`,
            compiled,
            interpretedStructure.shape === undefined ? undefined : interpreted,
          ] as [string, SchemasModule[string], SchemasModule[string] | undefined],
        ]),
    ...Object.keys(shape ?? {}).flatMap((key) =>
      findExposedSchemas(
        shape![key]!,
        interpretedStructure.shape !== undefined && Object.hasOwn(interpretedStructure.shape, key)
          ? interpretedStructure.shape[key]
          : undefined,
        `${at}.shape.${key}`,
      ),
    ),
    ...(element === undefined
      ? []
      : findExposedSchemas(element, interpretedStructure.element, `${at}.element`)),
  ];
};

/**
 * What validating `value` with `schema` does, as plain data: its Result
 * (`describeResult`), or the error it throws, as `.coerce()` does where
 * `String()` throws, on an object with no prototype.
 */
const describeValidation = (schema: SchemasModule[string], value: unknown): unknown => {
  try {
    return describeResult(schema.validate(value));
  } catch (error) {
    return { throws: String(error) };
  }
};

/** A fixture holding DIFFERENTIAL_FILE, with `@pvl/schema` linked so both it and its mirror run, compiled. */
const compileDifferentialFixture = async (): Promise<CompiledFixture> => {
  const root = await createFixture({
    'pvlconfig.json': configJson({}),
    'src/schemas/cases.ts': DIFFERENTIAL_FILE,
    'src/shared/user.ts': SHARED_FILE,
  });
  await linkSchemaPackage(root);
  return { root, payload: await runCompilation({ cwd: root }) };
};

// A file asserting, for every case, that the compiled export's inferred
// Input and Output, and its whole type, `shape` and `element` included, are
// identical to the interpreted one's.
const TYPE_CHECK_FILE = [
  "import type { InferInput, InferOutput } from '@pvl/schema';",
  "import type * as compiled from './.pvl/schemas/cases.ts';",
  "import type * as interpreted from './src/schemas/cases.ts';",
  '',
  'type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;',
  '',
  ...[...Object.keys(DIFFERENTIAL_CASES), 'interpretedParent'].flatMap((exportName) => [
    `export const ${exportName}Input: Equal<InferInput<typeof compiled.${exportName}>, InferInput<typeof interpreted.${exportName}>> = true;`,
    `export const ${exportName}Output: Equal<InferOutput<typeof compiled.${exportName}>, InferOutput<typeof interpreted.${exportName}>> = true;`,
    `export const ${exportName}Type: Equal<typeof compiled.${exportName}, typeof interpreted.${exportName}> = true;`,
  ]),
  '',
].join('\n');

describe('runCompilation(): Compiled Schemas validate as the interpreted path does', () => {
  it('returns the same value, Issue messages and Issue paths for generated inputs', async () => {
    const { root, payload } = await compileDifferentialFixture();
    const interpreted = (await import(path.join(root, 'src/schemas/cases.ts'))) as SchemasModule;
    const compiled = (await import(path.join(root, '.pvl/schemas/cases.ts'))) as SchemasModule;

    expect(payload.diagnostics).toEqual([]);
    expect(await readFixtureFile(root, '.pvl/schemas/cases.ts')).not.toMatch(
      /pvl\.compile\((?!\))/,
    );
    for (const exportName of [...Object.keys(DIFFERENTIAL_CASES), 'interpretedParent']) {
      for (const [at, compiledSchema, interpretedSchema] of findExposedSchemas(
        compiled[exportName]!,
        interpreted[exportName]!,
      )) {
        expect(interpretedSchema, `${exportName}${at}`).toBeDefined();
        // `shape` itself only has to be there, on both sides; its owner is diffed already.
        if (interpretedSchema === undefined || at.endsWith('.shape')) {
          continue;
        }
        fc.assert(
          fc.property(fc.oneof(validatedValue, parentValue, primitiveValue), (value) => {
            expect(describeValidation(compiledSchema, value)).toStrictEqual(
              describeValidation(interpretedSchema, value),
            );
          }),
          { numRuns: 300 },
        );
      }
    }
  });
});

describe('runCompilation(): Compiled Schemas type as the interpreted path does', () => {
  it('emits code that typechecks strictly, inferring the Input and Output pvl.compile() does', async () => {
    const { root, payload } = await compileDifferentialFixture();
    const project = new Project({
      compilerOptions: {
        strict: true,
        noImplicitOverride: true,
        noUncheckedIndexedAccess: true,
        noEmit: true,
        allowImportingTsExtensions: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
      },
    });
    project.addSourceFileAtPath(path.join(root, '.pvl/schemas/cases.ts'));
    project.createSourceFile(path.join(root, 'types.ts'), TYPE_CHECK_FILE);

    expect(payload.diagnostics).toEqual([]);
    expect(
      project
        .getPreEmitDiagnostics()
        .map(
          (diagnostic) =>
            `${String(diagnostic.getLineNumber())}: ${ts.flattenDiagnosticMessageText(diagnostic.compilerObject.messageText, ' ')}`,
        ),
    ).toEqual([]);
  });
});
