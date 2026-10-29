// VitePress site configuration for the @pcvl/schema documentation.
// The content root is `content/`, so the package's own files (package.json,
// typedoc.json, AGENTS.md) never become pages.
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as url from 'node:url';
import { defineConfig, type DefaultTheme } from 'vitepress';

/**
 * The API sidebar is written by `typedoc-vitepress-theme` alongside the
 * generated pages, so it is read at config-load time rather than imported:
 * the file is gitignored, and a static `import` of it would make `tsc
 * --noEmit` fail on a clean checkout that has not run `docs:api` yet.
 */
const loadApiSidebar = (): DefaultTheme.SidebarItem[] => {
  const path = url.fileURLToPath(new URL('../api/typedoc-sidebar.json', import.meta.url));
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8')) as DefaultTheme.SidebarItem[];
  } catch {
    throw new Error(
      `Generated API sidebar not found at ${path}. Run \`pnpm --filter docs docs:api\` first ` +
        '(`pnpm docs:dev` and `pnpm docs:build` do this for you).',
    );
  }
};

/**
 * The getting-started StackBlitz window runs only on a cross-origin isolated
 * page, so the dev and preview servers send every page these headers: a
 * client-side navigation keeps the first page's. Production sends the same
 * ones from `vercel.json`.
 */
const sendCrossOriginIsolationHeaders = (
  _request: http.IncomingMessage,
  response: http.ServerResponse,
  next: () => void,
): void => {
  response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
};

export default defineConfig({
  title: '@pcvl/schema',
  description: 'Compose schemas and validate values against them at runtime.',
  cleanUrls: true,
  vite: {
    // The repo-root `assets/` folder is the site's public directory, so the
    // banner has one copy, shared with the README.
    publicDir: url.fileURLToPath(new URL('../../../../assets', import.meta.url)),
    // A plugin, since `vite.server.headers` skips the HTML VitePress serves.
    plugins: [
      {
        name: 'cross-origin-isolation',
        configureServer: (server): void => {
          server.middlewares.use(sendCrossOriginIsolationHeaders);
        },
        configurePreviewServer: (server): void => {
          server.middlewares.use(sendCrossOriginIsolationHeaders);
        },
      },
    ],
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      // The GitHub wiki, published from docs/wiki/ (ADR-0037): how each
      // schema works inside, interpreted and compiled.
      { text: 'Behind the scenes', link: 'https://github.com/Ota-Prokopec/pvl/wiki' },
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
