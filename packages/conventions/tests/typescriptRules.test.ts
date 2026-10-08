import { join } from 'node:path';
import { argsTypeAboveFunction } from '../src/eslint/rules/argsTypeAboveFunction.ts';
import { barrelExportsOnly } from '../src/eslint/rules/barrelExportsOnly.ts';
import { constantShape } from '../src/eslint/rules/constantShape.ts';
import { enumShape } from '../src/eslint/rules/enumShape.ts';
import { noImportAlias } from '../src/eslint/rules/noImportAlias.ts';
import { noInlineEnumValue } from '../src/eslint/rules/noInlineEnumValue.ts';
import { noInterface } from '../src/eslint/rules/noInterface.ts';
import { noJavascriptFiles } from '../src/eslint/rules/noJavascriptFiles.ts';
import { noLocalFunctions } from '../src/eslint/rules/noLocalFunctions.ts';
import { noRegex } from '../src/eslint/rules/noRegex.ts';
import { createFixture, typescriptTester } from './helpers.ts';

typescriptTester.run('no-interface', noInterface, {
  valid: [
    'type User = { id: string };',
    'interface Kind { readonly type: Kind & this }',
    'interface Shape { area(): number }\nclass Square implements Shape { area(): number { return 1; } }',
  ],
  invalid: [
    { code: 'interface User { id: string }', errors: [{ messageId: 'useType' }] },
    {
      code: 'interface Shape { area(): number }\nclass Square implements Other { area(): number { return 1; } }',
      errors: [{ messageId: 'useType' }],
    },
  ],
});

typescriptTester.run('args-type-above-function', argsTypeAboveFunction, {
  valid: [
    'type CountArgs = { n: number };\nconst count = ({ n }: CountArgs): number => n;',
    'export type CountArgs = { n: number };\n/** Counts. */\nexport const count = ({ n }: CountArgs): number => n;',
    'type OtherArgs = { n: number };\nconst x = 1;\nconst count = ({ n }: OtherArgs): number => n;',
    'const run = (): void => {\n  type StepArgs = { n: number };\n  const step = ({ n }: StepArgs): number => n;\n};',
  ],
  invalid: [
    {
      code: 'type CountArgs = { n: number };\nconst x = 1;\nconst count = ({ n }: CountArgs): number => n;',
      errors: [{ messageId: 'placement', data: { type: 'CountArgs', name: 'count' } }],
    },
    {
      code: 'const count = ({ n }: CountArgs): number => n;\ntype CountArgs = { n: number };',
      errors: [{ messageId: 'placement' }],
    },
    {
      code: 'const run = (): void => {\n  type StepArgs = { n: number };\n  const x = 1;\n  const step = ({ n }: StepArgs): number => n + x;\n};',
      errors: [{ messageId: 'placement' }],
    },
  ],
});

typescriptTester.run('no-import-alias', noImportAlias, {
  valid: [
    "import { readFile } from 'node:fs';",
    "import * as path from 'node:path';",
    "import { join as joinPath } from 'node:path';\nconst join = (): string => '';",
    "import { Issue } from './issue.js';\nimport { Issue as StandardIssue } from '@standard-schema/spec';",
  ],
  invalid: [
    { code: "import { join as joinPath } from 'node:path';", errors: [{ messageId: 'noAlias' }] },
  ],
});

const barrelRoot = createFixture({
  'packages/lib/src/index.ts': '',
  'packages/lib/src/issue.ts': '',
  'packages/lib/src/internal.ts': '',
  'packages/lib/src/schemas/index.ts': '',
  'packages/lib/src/types.d.ts': '',
});
const barrel = join(barrelRoot, 'packages/lib/src/index.ts');

typescriptTester.run('barrel-exports-only', barrelExportsOnly, {
  valid: [
    {
      code: "export * from './issue.js';\n// internal.ts is deliberately omitted: internal-only.\nexport * from './schemas/index.js';",
      filename: barrel,
    },
    {
      code: "export * from './issue.js';\nexport * from './internal.js';\n// schemas/ is deliberately omitted.",
      filename: barrel,
    },
    {
      code: 'export const VALUE = 1 as const;',
      filename: join(barrelRoot, 'apps/web/src/index.ts'),
    },
  ],
  invalid: [
    {
      code: "export * from './issue.js';\nexport * from './internal.js';\nexport * from './schemas/index.js';\nexport type Kind = string;",
      filename: barrel,
      errors: [{ messageId: 'onlyExportAll' }],
    },
    {
      code: "export { Issue } from './issue.js';\nexport * from './internal.js';\nexport * from './schemas/index.js';",
      filename: barrel,
      errors: [
        { messageId: 'onlyExportAll' },
        { messageId: 'missingSibling', data: { name: 'issue', entry: 'issue.ts' } },
      ],
    },
    {
      code: "export * from './issue.js';",
      filename: barrel,
      errors: [
        { messageId: 'missingSibling', data: { name: 'internal', entry: 'internal.ts' } },
        { messageId: 'missingSibling', data: { name: 'schemas', entry: 'schemas/' } },
      ],
    },
  ],
});

const typesRoot = createFixture({
  'packages/types/package.json': '{ "name": "@repo/types" }',
  'packages/other/package.json': '{ "name": "@repo/other" }',
});

typescriptTester.run('no-inline-enum-value', noInlineEnumValue, {
  valid: [
    "import type { ValueOfEnum } from '@repo/types';\ntype Role = ValueOfEnum<typeof ROLE>;",
    {
      code: 'export type ValueOfEnum<T> = T[keyof T];',
      filename: join(typesRoot, 'packages/types/src/valueOfEnum.ts'),
    },
  ],
  invalid: [
    { code: 'type Role = (typeof ROLE)[keyof typeof ROLE];', errors: [{ messageId: 'inline' }] },
    {
      code: 'type ValueOfEnum<T> = T[keyof T];',
      filename: join(typesRoot, 'packages/other/src/enums.ts'),
      errors: [{ messageId: 'redeclared' }],
    },
  ],
});

typescriptTester.run('enum-shape', enumShape, {
  valid: [
    "const SYSTEM_ROLE = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const;",
    "const NODE_ENV = { DEVELOPMENT: 'development', TEST: 'test' } as const;",
    'const HTTP_STATUS = { OK_200: 200, BELOW: -1 } as const;',
    'const options = { depth: null, breakLength: Infinity } as const;',
    "const config = { name: 'x' };",
    {
      code: "export const SYSTEM_ROLE = { OWNER: 'OWNER' } as const;",
      filename: join(typesRoot, 'packages/other/src/enums.ts'),
    },
    {
      code: 'export const OPTIONS = { depth: 1, name: foo() } as const;',
      filename: join(typesRoot, 'packages/other/src/options.ts'),
    },
  ],
  invalid: [
    { code: "const systemRole = { OWNER: 'OWNER' } as const;", errors: [{ messageId: 'name' }] },
    {
      code: "export const SYSTEM_ROLE = { OWNER: 'OWNER' } as const;",
      filename: join(typesRoot, 'packages/other/src/consts.ts'),
      errors: [{ messageId: 'file' }],
    },
    {
      code: "const SYSTEM_ROLE = { OWNER: 'OWNER' } as const;\nexport { SYSTEM_ROLE };",
      filename: join(typesRoot, 'packages/other/src/roles.ts'),
      errors: [{ messageId: 'file' }],
    },
    {
      code: "const SYSTEM_ROLE = { owner: 'OWNER', 'member-role': 'MEMBER' } as const;",
      errors: [{ messageId: 'key' }, { messageId: 'key' }],
    },
  ],
});

typescriptTester.run('constant-shape', constantShape, {
  valid: [
    "const VENDOR = '@pvl/schema' as const;",
    'const MAX_SIZE = -1 as const;',
    'const ENABLED = true as const;',
    'const LIMIT = 10n as const;',
    'const GREETING = `hello` as const;',
    "const run = (): void => { const local = 'x'; };",
    'const pattern = /x/;',
    'const greeting = `hello ${name}`;',
    {
      code: "export const VENDOR = '@pvl/schema' as const;",
      filename: join(typesRoot, 'packages/other/src/consts.ts'),
    },
  ],
  invalid: [
    { code: "const vendor = '@pvl/schema' as const;", errors: [{ messageId: 'name' }] },
    { code: 'const RULE_WIDTH = 68;', errors: [{ messageId: 'asConst' }] },
    {
      code: "export const VENDOR = '@pvl/schema' as const;",
      filename: join(typesRoot, 'packages/other/src/schema.ts'),
      errors: [{ messageId: 'file' }],
    },
    {
      code: "const VENDOR = '@pvl/schema' as const;\nexport { VENDOR };",
      filename: join(typesRoot, 'packages/other/src/schema.ts'),
      errors: [{ messageId: 'file' }],
    },
  ],
});

typescriptTester.run('no-local-functions', noLocalFunctions, {
  valid: [
    'const double = (n: number): number => n * 2;\nconst run = (): number => double(2);',
    'function run(): number[] {\n  return [1, 2].map((n) => n * 2);\n}',
    'const run = (): { fn: () => number } => ({ fn: () => 1 });',
    'class Box {\n  get(): number {\n    return 1;\n  }\n}',
  ],
  invalid: [
    {
      code: 'const run = (): number => {\n  const double = (n: number): number => n * 2;\n  return double(2);\n};',
      errors: [{ messageId: 'moveToModuleScope', data: { name: 'double' } }],
    },
    {
      code: 'function run(): number {\n  function double(n: number): number {\n    return n * 2;\n  }\n  return double(2);\n}',
      errors: [{ messageId: 'moveToModuleScope', data: { name: 'double' } }],
    },
    {
      code: 'class Box {\n  get(): number {\n    const one = function (): number {\n      return 1;\n    };\n    return one();\n  }\n}',
      errors: [{ messageId: 'moveToModuleScope', data: { name: 'one' } }],
    },
  ],
});

typescriptTester.run('no-regex', noRegex, {
  valid: ["const isEmpty = (value: string): boolean => value === '';"],
  invalid: [
    { code: 'const pattern = /^a+$/;', errors: [{ messageId: 'noRegex' }] },
    { code: "const pattern = new RegExp('a+');", errors: [{ messageId: 'noRegex' }] },
    { code: "const pattern = RegExp('a+');", errors: [{ messageId: 'noRegex' }] },
  ],
});

typescriptTester.run('no-javascript-files', noJavascriptFiles, {
  valid: [],
  invalid: [
    {
      code: 'export const value = 1;',
      filename: 'config.mjs',
      errors: [{ messageId: 'noJavascript' }],
    },
  ],
});
