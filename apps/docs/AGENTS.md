# `docs`

The user-facing documentation site for [`@pvl/schema`](../../packages/schema/AGENTS.md): a [VitePress](https://vitepress.dev) site whose guide pages are hand-written and whose API reference is generated from the library's source by [TypeDoc](https://typedoc.org). See the root [`AGENTS.md`](../../AGENTS.md) for repo-wide rules and [`CONTEXT.md`](../../CONTEXT.md) for the domain glossary the pages use (`Schema`, `Result`, `Issue`, `Refinement`, `Transform`, `Coercion`).

It documents `@pvl/schema` only — `@pvl/schema-compiler` has no implementation yet, so it has nothing to document. **Deployment is not set up**: this package builds and previews a site locally and stops there. Hosting it is [issue #59](https://github.com/Ota-Prokopec/pvl/issues/59).

## Technology

- TypeScript, ESM (see root `AGENTS.md` Core Rules). The only TypeScript here is `content/.vitepress/config.ts`.
- VitePress `1.6.4`, TypeDoc `0.28.x` with `typedoc-plugin-markdown` and `typedoc-vitepress-theme`. All three are pinned: VitePress 2.x exists only as an alpha with moving config and theme APIs, and the two TypeDoc plugins peer-depend on `typedoc: 0.28.x`.
- Shared `@repo/eslint-config` (`base`) and `@repo/typescript-config` (`base.json`), as everywhere else.
- `@pvl/schema` is a real `workspace:*` dependency — see "Why the workspace dependency is declared" below.

## This package pins its own TypeScript

`apps/docs` declares `typescript: ~5.9.3` while the rest of the repo is on `7.0.2`, deliberately: TypeDoc does not accept TypeScript 7, and 5.9 is the newest stable release it does accept. pnpm isolates it, so only the doc generator sees it.

**Do not "fix" this by aligning it with the root pin** — TypeDoc fails at runtime against 7.0.2, not at install time, so the failure would look like a TypeDoc bug. The full reasoning, the rejected alternatives and the trigger for reverting are in [ADR-0014](../../docs/adr/0014-typedoc-pinned-to-typescript-5-9.md).

The practical consequence: TypeScript-7-only syntax in `packages/schema/src` breaks documentation generation. If `docs:api` starts failing on syntax the rest of the repo compiles fine, that is this pin talking.

## The content root is `content/`, not the package root

VitePress is pointed at `content/`, so only what lives there becomes a page; `package.json`, `typedoc.json`, `tsconfig.json` and this file stay out of the site's page space by construction.

Keep it that way. With the content root at the package root, this `AGENTS.md` would publish as `/AGENTS`, and the alternative — a negative `srcExclude` list — silently breaks the next time a root-level markdown file is added.

## `content/api/` is generated, and is not committed

TypeDoc writes `content/api/` — one page per exported symbol, plus `typedoc-sidebar.json` — from `packages/schema/src/index.ts`. The directory is listed in the root `.gitignore` and `.prettierignore`.

- **Never edit a file under `content/api/`.** The next `docs:api` run overwrites it.
- **Never commit that directory.** Committed generated markdown produces a large meaningless diff on every TSDoc tweak, and rots silently when someone forgets to regenerate.
- To change what the reference says, change the TSDoc in `packages/schema/src` — see that package's `AGENTS.md` for the TSDoc convention.

`docs:api` runs as a pre-step of **both** `dev` and `build`, so a fresh clone can run `pnpm docs:dev` with no extra step. It is also safe to run on its own while writing TSDoc.

### The two sidebars differ on purpose

The guide sidebar in `content/.vitepress/config.ts` is hand-written: two stable, deliberate pages. The API sidebar is read from the generated `typedoc-sidebar.json` at config-load time, because a hand-written sidebar over generated content is guaranteed to drift, and with the output gitignored nobody would see the drift in review. It is read off disk rather than `import`ed so `tsc --noEmit` does not fail on a clean checkout that has not generated the API yet.

## TypeDoc reads source, not `dist`

The entry point is `packages/schema/src/index.ts`, with `tsconfig` pointing at that package's own `tsconfig.json`. Two reasons: there is no build dependency to sequence, and TSDoc on internal members stays visible to TypeDoc so `excludeInternal` actually filters — declaration output strips some of that context.

### Why the workspace dependency is declared

TypeDoc reads the schema source directly and does not need the built package, but without `"@pvl/schema": "workspace:*"` in `package.json`, Turborepo has no graph edge and will not invalidate the docs cache when the library's TSDoc changes. The dependency is also honest: the guide's code examples import `@pvl/schema`.

## Scripts

`dev` and `build` each run `docs:api` first, then `vitepress dev`/`vitepress build` over `content` — reached from the repo root as `pnpm docs:dev` and `pnpm docs:build`. `lint` and `check-types` are as everywhere else. Multi-step scripts compose named steps with `npm-run-all`'s `run-s` rather than `&&`, per [`docs/standards/turborepo.md`](../../docs/standards/turborepo.md).

**There is no `test` script, and that is a decision, not an omission** — `apps/playground` sets the same precedent, and Turborepo skips packages without one. The seams that apply are `check-types` on the VitePress config, `lint`, and `build` itself, which fails on a dead internal link. Verifying that the documentation's _examples_ still compile is [issue #60](https://github.com/Ota-Prokopec/pvl/issues/60), not something this package asserts today.

## Guide content

Exactly two pages, and adding a third is a decision worth making deliberately rather than by accident:

- `content/guide/getting-started.md` — installing, a first schema, reading a `Result`, type inference.
- `content/guide/schemas.md` — one section per schema type, then the shared modifiers.

An error-handling deep dive, Standard Schema interop, and anything about `@pvl/schema-compiler` are deliberately not here yet.

The getting-started page opens with a `::: warning` callout stating that `@pvl/schema` is unpublished. **Delete that callout on the first npm release** — it exists so the `pnpm add @pvl/schema` line above it does not silently fail for a reader.

## Coding style / best practices

- Follow [`docs/standards/typescript.md`](../../docs/standards/typescript.md) for the VitePress config and [`docs/standards/turborepo.md`](../../docs/standards/turborepo.md) for script wiring.
- Use the vocabulary the library's own code uses (`validate()`, `Result`, `Issue`), not a paraphrase of it.
- Prose in the guide describes what the library does today. A capability that does not exist yet — Compiled Schemas, async validation — is either absent or named as absent, never implied.
