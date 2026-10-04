/**
 * The ESLint preset every workspace entry lints its TypeScript with:
 * typescript-eslint (syntax only, no type information) plus the
 * `@repo/conventions` rules. Inline disable comments are switched off, so an
 * exception is built into a rule or set as a file-scoped override.
 */
import js from '@eslint/js';
import { conventionsPlugin } from '@repo/conventions/eslint';
import type { Linter } from 'eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import turbo from 'eslint-plugin-turbo';
import tseslint from 'typescript-eslint';

const TS_FILES = ['**/*.{ts,tsx,mts,cts}'];

/** Selectors for the conventions that core `no-restricted-syntax` can check; each message is the instruction to follow. */
const RESTRICTED_SYNTAX = [
  {
    selector: 'TSEnumDeclaration',
    message: 'Declare an `as const` object instead of a TypeScript `enum`.',
  },
  {
    selector: 'FunctionDeclaration',
    message:
      'Declare an arrow function (`const name = (): Type => {}`) instead of a `function` declaration.',
  },
  {
    selector:
      'FunctionExpression:not(MethodDefinition > FunctionExpression, Property[method=true] > FunctionExpression, Property[kind=/^(get|set)$/] > FunctionExpression)',
    message: 'Use an arrow function instead of a `function` expression.',
  },
  {
    selector: "CallExpression[callee.name='require']",
    message: 'Use an ESM `import` instead of `require`.',
  },
  {
    selector: "MemberExpression[object.name='module'][property.name='exports']",
    message: 'Use an ESM `export` instead of `module.exports`.',
  },
  {
    selector: "MemberExpression[object.name='exports']",
    message: 'Use an ESM `export` instead of `exports.*`.',
  },
  {
    selector: 'TSExternalModuleReference',
    message: 'Use an ESM `import` instead of `import … = require(…)`.',
  },
];

export const config: Linter.Config[] = defineConfig(
  {
    ignores: ['**/dist/**', '**/.turbo/**', '**/*.{js,mjs,cjs}'],
  },
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
  },
  {
    files: TS_FILES,
    extends: [js.configs.recommended, tseslint.configs.eslintRecommended],
    languageOptions: {
      parser: tseslint.parser,
      // Every entry lints from its own directory; without this the parser
      // finds every entry's tsconfig and refuses to pick one.
      parserOptions: { tsconfigRootDir: process.cwd() },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      '@repo/conventions': conventionsPlugin,
      turbo,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX],
      '@repo/conventions/no-interface': 'error',
      '@repo/conventions/no-import-alias': 'error',
      '@repo/conventions/barrel-exports-only': 'error',
      '@repo/conventions/no-inline-enum-value': 'error',
      '@repo/conventions/enum-shape': 'error',
      '@repo/conventions/constant-shape': 'error',
      'turbo/no-undeclared-env-vars': 'error',
    },
  },
  eslintConfigPrettier,
);
