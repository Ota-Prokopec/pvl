import { config } from '@repo/eslint-config/base';
import { conventionsPlugin } from '@repo/conventions/eslint';
import { defineConfig } from 'eslint/config';
import jsdoc from 'eslint-plugin-jsdoc';

// Exported declarations and public class members, the surface TypeDoc
// publishes as the API reference.
const DOCUMENTED = [
  'ExportNamedDeclaration[declaration.type]',
  "ExportNamedDeclaration > ClassDeclaration MethodDefinition:not([accessibility='private'], [accessibility='protected'], [key.type='PrivateIdentifier'])",
  "ExportNamedDeclaration > ClassDeclaration PropertyDefinition:not([accessibility='private'], [accessibility='protected'], [key.type='PrivateIdentifier'])",
];

export default defineConfig(
  config,
  {
    files: ['src/**/*.ts'],
    plugins: { '@repo/conventions': conventionsPlugin },
    rules: {
      '@repo/conventions/no-regex': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    // Outside the barrel on purpose, so TypeDoc never publishes them.
    ignores: ['src/modifiers/**', 'src/utils.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': ['error', { require: {}, contexts: DOCUMENTED }],
      'jsdoc/require-example': ['error', { contexts: DOCUMENTED, exemptedBy: ['internal'] }],
    },
  },
  {
    // A type test declares a schema only to read its inferred type
    // (`typeof schema`), which this rule would report as unused.
    files: ['tests/standard-schema-types.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
