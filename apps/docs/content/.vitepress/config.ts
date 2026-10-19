// VitePress site configuration for the @pvl/schema documentation.
// The content root is `content/`, so the package's own files (package.json,
// typedoc.json, AGENTS.md) never become pages.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type DefaultTheme } from 'vitepress';

/**
 * The API sidebar is written by `typedoc-vitepress-theme` alongside the
 * generated pages, so it is read at config-load time rather than imported:
 * the file is gitignored, and a static `import` of it would make `tsc
 * --noEmit` fail on a clean checkout that has not run `docs:api` yet.
 */
const loadApiSidebar = (): DefaultTheme.SidebarItem[] => {
  const path = fileURLToPath(new URL('../api/typedoc-sidebar.json', import.meta.url));
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as DefaultTheme.SidebarItem[];
  } catch {
    throw new Error(
      `Generated API sidebar not found at ${path}. Run \`pnpm --filter docs docs:api\` first ` +
        '(`pnpm docs:dev` and `pnpm docs:build` do this for you).',
    );
  }
};

export default defineConfig({
  title: '@pvl/schema',
  description: 'Compose schemas and validate values against them at runtime.',
  cleanUrls: true,
  // The repo-root `assets/` folder is the site's public directory, so the
  // banner has one copy, shared with the README.
  vite: { publicDir: fileURLToPath(new URL('../../../../assets', import.meta.url)) },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
    ],
    sidebar: {
      // Hand-written: two stable, deliberate pages.
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Schemas', link: '/guide/schemas' },
          ],
        },
      ],
      // Generated: a hand-written sidebar over generated pages would drift
      // silently, because the pages themselves are not committed.
      '/api/': loadApiSidebar(),
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/Ota-Prokopec/pvl' }],
  },
});
