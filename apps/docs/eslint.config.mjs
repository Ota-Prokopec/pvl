import { config } from '@repo/eslint-config/base';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    // Build artifacts, not source: VitePress writes the site into
    // `content/.vitepress/dist`, caches into `content/.vitepress/cache`, and
    // TypeDoc regenerates `content/api` on every docs build. None is committed.
    ignores: ['content/.vitepress/dist/**', 'content/.vitepress/cache/**', 'content/api/**'],
  },
];
