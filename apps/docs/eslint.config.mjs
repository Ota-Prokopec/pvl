import { config } from '@repo/eslint-config/base';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    // Build artifacts, not source: VitePress writes the site into
    // `content/.vitepress/dist`, caches into `content/.vitepress/cache`, TypeDoc
    // regenerates `content/api` on every docs build, and `examples/` holds the
    // documentation snippets extracted for `check-types`. None is committed, and
    // the extracted snippets are the documentation's code, not this package's —
    // linting them would be linting the guide.
    ignores: [
      'content/.vitepress/dist/**',
      'content/.vitepress/cache/**',
      'content/api/**',
      'examples/**',
    ],
  },
];
