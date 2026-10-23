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
// of an object or array at least once, alone, combined and nested, and each
// primitive, literal and enum at the root, `.optional()`/`.nullable()` on a
// root of each kind.
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
};

// An interpreted object whose fields are Compiled Schemas, so their Issues
// are reported under the parent's path.
const INTERPRETED_PARENT =
  'pvl.object({ inner: pvl.compile(pvl.object({ name: pvl.string() }).strict()), list: pvl.compile(pvl.array(pvl.number()).min(1)) })' as const;

// The scanned file the differential test compiles: every case, exported
// compiled, the interpreted parent, the constants one case reads, and the
// values the Runtime Argument cases evaluate, one of them in a const a case
// follows.
const DIFFERENTIAL_FILE = schemaFile(
  [
    'const MAX = 9;',
    'const name = pvl.string().min(2);',
    'let LIMIT = 4;',
    "const getMessage = (): string => 'from a call';",
    "const emptyMessage = (): string => '';",
    'const OPTIONS = { message: getMessage() };',
    'const hoistedBase = pvl.string().max(LIMIT + 1);',
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
  'name',
  'code',
  'age',
  'admin',
  'id',
  'kind',
  'role',
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

/** A fixture holding DIFFERENTIAL_FILE, with `@pvl/schema` linked so both it and its mirror run, compiled. */
const compileDifferentialFixture = async (): Promise<CompiledFixture> => {
  const root = await createFixture({
    'pvlconfig.json': configJson({}),
    'src/schemas/cases.ts': DIFFERENTIAL_FILE,
  });
  await linkSchemaPackage(root);
  return { root, payload: await runCompilation({ cwd: root }) };
};

// A file asserting, for every case, that the compiled export's inferred
// Input and Output are identical to the interpreted one's.
const TYPE_CHECK_FILE = [
  "import type { InferInput, InferOutput } from '@pvl/schema';",
  "import type * as compiled from './.pvl/schemas/cases.ts';",
  "import type * as interpreted from './src/schemas/cases.ts';",
  '',
  'type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;',
  '',
  ...Object.keys(DIFFERENTIAL_CASES).flatMap((exportName) => [
    `export const ${exportName}Input: Equal<InferInput<typeof compiled.${exportName}>, InferInput<typeof interpreted.${exportName}>> = true;`,
    `export const ${exportName}Output: Equal<InferOutput<typeof compiled.${exportName}>, InferOutput<typeof interpreted.${exportName}>> = true;`,
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
      fc.assert(
        fc.property(fc.oneof(validatedValue, parentValue, primitiveValue), (value) => {
          expect(describeResult(compiled[exportName]!.validate(value))).toStrictEqual(
            describeResult(interpreted[exportName]!.validate(value)),
          );
        }),
        { numRuns: 300 },
      );
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
