import { config } from '@repo/eslint-config/base';
import { defineConfig } from 'eslint/config';

export default defineConfig(config, {
  // The documentation snippets `check-types` extracts: generated, never
  // committed, and the guide's code rather than this package's.
  ignores: ['examples/**'],
});
