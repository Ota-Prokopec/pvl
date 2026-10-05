import { join } from 'node:path';
import { entryHasAgentsMd } from '../src/eslint/rules/entryHasAgentsMd.ts';
import { envFileNames } from '../src/eslint/rules/envFileNames.ts';
import { noSourceLayoutHeading } from '../src/eslint/rules/noSourceLayoutHeading.ts';
import { packageJsonModuleType } from '../src/eslint/rules/packageJsonModuleType.ts';
import { packageJsonScripts } from '../src/eslint/rules/packageJsonScripts.ts';
import { tsconfigExtends } from '../src/eslint/rules/tsconfigExtends.ts';
import { createFixture, jsoncTester, jsonTester, markdownTester } from './helpers.ts';

jsonTester.run('package-json-scripts', packageJsonScripts, {
  valid: [
    '{ "scripts": { "build": "tsup", "lint": "eslint . --max-warnings 0" } }',
    '{ "scripts": { "build": "run-s build:bundle build:types" }, "devDependencies": { "npm-run-all": "^4.1.5" } }',
    '{ "scripts": { "test": "vitest run 2>&1" } }',
    '{ "name": "no-scripts" }',
  ],
  invalid: [
    { code: '{ "scripts": { "build": "tsup && tsc" } }', errors: [{ messageId: 'chain' }] },
    { code: '{ "scripts": { "build": "tsup || true" } }', errors: [{ messageId: 'chain' }] },
    { code: '{ "scripts": { "build": "tsup; tsc" } }', errors: [{ messageId: 'chain' }] },
    { code: '{ "scripts": { "dev": "tsup --watch & vitest" } }', errors: [{ messageId: 'chain' }] },
    { code: '{ "scripts": { "build": "run-p a b" } }', errors: [{ messageId: 'runAll' }] },
  ],
});

jsonTester.run('package-json-module-type', packageJsonModuleType, {
  valid: ['{ "name": "pkg", "type": "module" }'],
  invalid: [
    { code: '{ "name": "pkg" }', errors: [{ messageId: 'moduleType' }] },
    { code: '{ "name": "pkg", "type": "commonjs" }', errors: [{ messageId: 'moduleType' }] },
  ],
});

jsoncTester.run('tsconfig-extends', tsconfigExtends, {
  valid: [
    '{ "extends": "@repo/typescript-config/base.json" }',
    '{\n  // The build only.\n  "extends": "./tsconfig.json"\n}',
  ],
  invalid: [
    { code: '{ "compilerOptions": { "strict": true } }', errors: [{ messageId: 'extends' }] },
    { code: '{ "extends": "../tsconfig.json" }', errors: [{ messageId: 'extends' }] },
    { code: '{ "extends": "@tsconfig/node24/tsconfig.json" }', errors: [{ messageId: 'extends' }] },
  ],
});

markdownTester.run('no-source-layout-heading', noSourceLayoutHeading, {
  valid: ['# `@pvl/schema`\n\n## Architecture\n\nText about the source layout.'],
  invalid: [
    {
      code: '# pkg\n\n## Source Layout\n\n- `src/index.ts`',
      errors: [{ messageId: 'sourceLayout' }],
    },
    { code: '# pkg\n\n### source layout', errors: [{ messageId: 'sourceLayout' }] },
  ],
});

const workspace = createFixture({
  'apps/web/package.json': '{}',
  'apps/web/AGENTS.md': '# web',
  'apps/web/.env.production': '',
  'apps/web/.env.development': '',
  'apps/web/node_modules/dep/.env': '',
  'apps/api/package.json': '{}',
  'apps/api/.env': '',
  'apps/api/config/.env.local': '',
  'packages/lib/package.json': '{}',
  'scripts/tool/package.json': '{}',
  'package.json': '{}',
});

jsonTester.run('env-file-names', envFileNames, {
  valid: [
    { code: '{}', filename: join(workspace, 'apps/web/package.json') },
    { code: '{}', filename: join(workspace, 'package.json') },
  ],
  invalid: [
    {
      code: '{}',
      filename: join(workspace, 'apps/api/package.json'),
      errors: [
        { messageId: 'envName', data: { file: '.env' } },
        { messageId: 'envName', data: { file: join('config', '.env.local') } },
      ],
    },
  ],
});

jsonTester.run('entry-has-agents-md', entryHasAgentsMd, {
  valid: [
    { code: '{}', filename: join(workspace, 'apps/web/package.json') },
    { code: '{}', filename: join(workspace, 'scripts/tool/package.json') },
    { code: '{}', filename: join(workspace, 'package.json') },
  ],
  invalid: [
    {
      code: '{}',
      filename: join(workspace, 'packages/lib/package.json'),
      errors: [{ messageId: 'missing', data: { entry: join('packages', 'lib') } }],
    },
  ],
});
