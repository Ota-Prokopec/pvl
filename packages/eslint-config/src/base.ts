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
import { RESTRICTED_SYNTAX, TS_FILES } from './consts.ts';

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
      '@repo/conventions/node-builtin-namespace-import': 'error',
      '@repo/conventions/barrel-exports-only': 'error',
      '@repo/conventions/no-inline-enum-value': 'error',
      '@repo/conventions/enum-shape': 'error',
      '@repo/conventions/constant-shape': 'error',
      '@repo/conventions/declarations-file-or-folder': 'error',
      '@repo/conventions/args-type-above-function': 'error',
      '@repo/conventions/no-local-functions': 'error',
      '@repo/conventions/class-file-name': 'error',
      'turbo/no-undeclared-env-vars': 'error',
    },
  },
  {
    // A test's or a tool config's tables stay beside what reads them.
    files: ['src/**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@repo/conventions/compound-constant-file': 'error',
    },
  },
  eslintConfigPrettier,
);
