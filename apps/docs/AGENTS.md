# `docs`

The user-facing documentation site for [`@pvl/schema`](../../packages/schema/AGENTS.md): a [VitePress](https://vitepress.dev) site with hand-written guide pages and an API reference that [TypeDoc](https://typedoc.org) generates from the library's source. It documents `@pvl/schema` only, since `@pvl/schema-compiler` has no implementation yet. It builds and previews locally; hosting is [issue #59](https://github.com/Ota-Prokopec/pvl/issues/59).

## Technology

- VitePress `1.6.4` and TypeDoc `0.28.x` with `typedoc-plugin-markdown` and `typedoc-vitepress-theme`, all pinned: VitePress 2.x is still an alpha with moving config and theme APIs, and both plugins peer-depend on `typedoc: 0.28.x`.
- The hand-written TypeScript is `content/.vitepress/config.ts` and `scripts/`. Node runs `scripts/` by stripping its types, so a relative import names the `.ts` file (`allowImportingTsExtensions`).
- `@standard-schema/spec` is a devDependency because the guide's type-inference snippet imports it. `vite` is declared only for `vitest`'s peer range; VitePress keeps its own `vite` 5.

## `content/` is the site root

VitePress serves only `content/`, so `package.json`, `typedoc.json` and this file stay off the site by construction. Keep it that way: at the package root, this file would publish as `/AGENTS`, and a `srcExclude` list breaks silently the next time a root-level markdown file appears.

## `content/api/` is generated

TypeDoc writes `content/api/` (one page per exported symbol, plus `typedoc-sidebar.json`) from `packages/schema/src/index.ts`. It is gitignored and prettier-ignored, and the next `docs:api` run overwrites it. To change what the reference says, change the TSDoc in `packages/schema/src`, following [`tsdoc.md`](../../docs/standards/tsdoc.md). `docs:api` runs before both `dev` and `build`, so a fresh clone runs `pnpm docs:dev` with no extra step.

The guide sidebar in `content/.vitepress/config.ts` is hand-written. The API sidebar is read from the generated `typedoc-sidebar.json` at config load, off disk rather than through an `import`, so `tsc --noEmit` passes on a checkout that hasn't generated it yet.

## TypeDoc reads source, not `dist`

The entry point is `packages/schema/src/index.ts`, with that package's own `tsconfig.json`. There's no build to sequence, and `excludeInternal` sees the `@internal` tags that declaration output would strip.

`package.json` still declares `"@pvl/schema": "workspace:*"`: without that graph edge Turborepo wouldn't invalidate the docs cache when the library's TSDoc changes, and the guide's examples import the package anyway.

## The documentation's code examples are typechecked

`check-types` compiles every fenced `ts` block in `content/guide/` and every TSDoc `@example` in `packages/schema/src`, without executing them ([ADR-0023](../../docs/adr/0023-documentation-examples-are-typechecked-not-executed.md)). `scripts/extractDocExamples.ts` writes one file per snippet into `examples/`, and `tsconfig.examples.json` compiles them. `scripts/docExamples.ts` holds the pure parsing and rendering logic.

- **`examples/` is generated**, on the same terms as `content/api/`. Each file starts with `// Generated from <source>:<line>.`, so follow a `tsc` error back to the documentation through that header.
- **On a guide page, imports accumulate and declarations don't.** A snippet sees every import an earlier snippet on the page showed, but compiles in its own block scope. A snippet whose declarations later ones build on is marked ` ```ts docs-check-shared `; prefer a self-contained snippet over the marker.
- **` ```ts docs-check-skip ` opts a snippet out**, only for code that is meant not to compile. A snippet that fails because the API moved is the harness working.
- **A silent skip is a bug.** An unknown `docs-check-` token is an error, and `extractFenceLanguage` normalizes the fence language the way VitePress's `extractLang` does (`ts:line-numbers`, `ts{1,3}` are still `ts`). Keep the two in step if VitePress adds a form.

## Tests cover the extraction only

The site itself has no unit tests, by decision. `test` covers the example-extraction logic in `scripts/`. The site's checks are `check-types`, `lint`, and `build`, which fails on a dead internal link.

## Guide content

Two pages, and a third is a deliberate decision:

- `content/guide/getting-started.md`: installing, a first schema, reading a `Result`, type inference.
- `content/guide/schemas.md`: one section per schema type, then the shared Modifiers.

The getting-started page opens with a `::: warning` callout saying `@pvl/schema` is unpublished, so the `pnpm add @pvl/schema` line under it doesn't fail a reader silently. Delete that callout on the first npm release.

## Writing the guide

- Use the library's own vocabulary (`validate()`, `Result`, `Issue`).
- Describe what the library does today. A capability that doesn't exist yet (Compiled Schemas, async validation) is absent or named as absent.
