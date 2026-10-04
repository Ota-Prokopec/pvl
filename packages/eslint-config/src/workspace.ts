/**
 * The ESLint preset for the root `lint:workspace` task: checks that span the
 * whole workspace rather than one entry's TypeScript (`package.json`,
 * `tsconfig*.json`, `AGENTS.md`, and any JavaScript file).
 */
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import { conventionsPlugin } from '@repo/conventions/eslint';
import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';

const GITIGNORE = fileURLToPath(new URL('../../../.gitignore', import.meta.url));

export const config: Linter.Config[] = defineConfig(
  includeIgnoreFile(GITIGNORE),
  {
    ignores: ['.agents/**', '.claude/**', '**/node_modules/**', '**/dist/**', '**/.turbo/**'],
  },
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
  },
  {
    plugins: { json, markdown, '@repo/conventions': conventionsPlugin },
  },
  {
    files: ['**/package.json'],
    language: 'json/json',
    rules: {
      '@repo/conventions/package-json-scripts': 'error',
      '@repo/conventions/package-json-module-type': 'error',
      '@repo/conventions/env-file-names': 'error',
      '@repo/conventions/entry-has-agents-md': 'error',
    },
  },
  {
    files: ['**/tsconfig*.json'],
    ignores: ['packages/typescript-config/**'],
    language: 'json/jsonc',
    rules: {
      '@repo/conventions/tsconfig-extends': 'error',
    },
  },
  {
    files: ['**/AGENTS.md'],
    language: 'markdown/gfm',
    rules: {
      '@repo/conventions/no-source-layout-heading': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      '@repo/conventions/no-javascript-files': 'error',
    },
  },
);
