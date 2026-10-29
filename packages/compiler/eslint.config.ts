import { config } from '@repo/eslint-config/base';
import { RESTRICTED_SYNTAX } from '@repo/eslint-config/consts';
import { conventionsPlugin } from '@repo/conventions/eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  config,
  {
    files: ['src/**/*.ts'],
    // The AST helpers themselves.
    ignores: ['src/ast/**'],
    plugins: { '@repo/conventions': conventionsPlugin },
    rules: {
      '@repo/conventions/ts-morph-through-ast': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    // The one class extending `Error` itself (ADR-0037).
    ignores: ['src/exceptions/baseException.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...RESTRICTED_SYNTAX,
        {
          selector:
            "ClassDeclaration[superClass.name='Error'], ClassExpression[superClass.name='Error']",
          message:
            'Extend `BaseException` (`src/exceptions/`) instead of `Error`, naming the diagnostic it is reported as. A bug in the compiler throws a plain `new Error(…)`, never a class of its own.',
        },
      ],
    },
  },
);
