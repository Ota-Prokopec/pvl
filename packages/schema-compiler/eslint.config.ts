import { config } from '@repo/eslint-config/base';
import { conventionsPlugin } from '@repo/conventions/eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(config, {
  files: ['src/**/*.ts'],
  // The AST helpers themselves, and the statement checks and Module Specifier
  // search that each stay in the one place they are used.
  ignores: ['src/ast/**', 'src/precheck.ts', 'src/module.ts'],
  plugins: { '@repo/conventions': conventionsPlugin },
  rules: {
    '@repo/conventions/ts-morph-through-ast': 'error',
  },
});
