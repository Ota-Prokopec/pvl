# `docs`

The user-facing documentation site for [`@pcvl/schema`](../../packages/schema/AGENTS.md): a [VitePress](https://vitepress.dev) site with hand-written guide pages and an API reference that [TypeDoc](https://typedoc.org) generates from the library's source. It documents `@pcvl/schema`, and of `@pcvl/compiler` only the getting-started page's "Compile it" section and its StackBlitz window; a full compiler guide is a separate issue. It builds and previews locally; hosting is [issue #59](https://github.com/Ota-Prokopec/pvl/issues/59).

## Technology

- VitePress `1.6.4` and TypeDoc `0.28.x` with `typedoc-plugin-markdown` and `typedoc-vitepress-theme`, all pinned: VitePress 2.x is still an alpha with moving config and theme APIs, and both plugins peer-depend on `typedoc: 0.28.x`.
- The only TypeScript is `content/.vitepress/config.ts`.

## `content/` is the site root

VitePress serves only `content/`, so `package.json`, `typedoc.json` and this file stay off the site by construction. Keep it that way: at the package root, this file would publish as `/AGENTS`, and a `srcExclude` list breaks silently the next time a root-level markdown file appears.

## The banner lives in the root `assets/`

`vite.publicDir` in `config.ts` points at the repo-root `assets/` folder, so `assets/banner.jpeg` is one file shared by the README and the landing page (`content/.vitepress/theme/index.ts` renders it above the hero). Anything added to `assets/` is published at the site root.

## `content/api/` is generated

TypeDoc writes `content/api/` (one page per exported symbol, plus `typedoc-sidebar.json`) from `packages/schema/src/index.ts`. It is gitignored and prettier-ignored, and the next `docs:api` run overwrites it. To change what the reference says, change the TSDoc in `packages/schema/src`, following [`tsdoc.md`](../../docs/standards/tsdoc.md). `docs:api` runs before both `dev` and `build`, so a fresh clone runs `pnpm docs:dev` with no extra step.

The guide sidebar in `content/.vitepress/config.ts` is hand-written. The API sidebar is read from the generated `typedoc-sidebar.json` at config load, off disk rather than through an `import`, so `tsc --noEmit` passes on a checkout that hasn't generated it yet.

## TypeDoc reads source, not `dist`

The entry point is `packages/schema/src/index.ts`, with that package's own `tsconfig.json`. There's no build to sequence, and `excludeInternal` sees the `@internal` tags that declaration output would strip.

`package.json` still declares `"@pcvl/schema": "workspace:*"`: without that graph edge Turborepo wouldn't invalidate the docs cache when the library's TSDoc changes, and the guide's examples import the package anyway.

## No tests, by decision

The checks are `check-types` on the VitePress config, `lint`, and `build`, which fails on a dead internal link. Compiling the guide's examples is [issue #60](https://github.com/Ota-Prokopec/pvl/issues/60).

## Guide content

Two pages, and a third is a deliberate decision:

- `content/guide/getting-started.md`: installing, a first schema, reading a `Result`, type inference, then "Compile it" and a lazy StackBlitz `<iframe>`; `ctl=1` makes the reader click before StackBlitz boots Node.js and installs packages in the browser. StackBlitz runs the project only on a cross-origin isolated page: every page sends `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin` (a plugin in `config.ts` for `dev` and `preview`, `vercel.json` in production, which also sets `cleanUrls` so Vercel serves the extensionless links `cleanUrls: true` in `config.ts` produces), and the iframe is `credentialless`. Without them StackBlitz shows the editor but never starts the terminal. The iframe loads [`stackblitz/get-started-docs`](../../stackblitz/AGENTS.md) straight from `main` on GitHub, so a preview or `docs:dev` shows `main`'s project, not the branch's.
- `content/guide/schemas.md`: one section per schema type, then the shared Modifiers.

The getting-started page opens with a `::: warning` callout saying both packages are prereleases on the `next` dist-tag, so every install command on the page uses `@next`. Delete that callout, and drop `@next`, when `0.1.0` ships on `latest`.

## Writing the guide

- Use the library's own vocabulary (`validate()`, `Result`, `Issue`).
- How a schema works inside belongs in the [wiki](../../docs/agents/wiki.md), not here. Each schema and Shared Modifier section of `schemas.md` ends with a `::: info Behind the scenes` box linking its wiki page, and the nav and both "What comes next" lists link the wiki's home. A new section gets its box; the links are absolute `https://github.com/Ota-Prokopec/pvl/wiki/<Page>` URLs, which `build` doesn't check.
- Describe what the library does today. A capability that doesn't exist yet (async validation, compiling a `union`) is absent or named as absent.
