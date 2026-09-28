# `docs`

The user-facing documentation site for [`@pvl/schema`](../../packages/schema/AGENTS.md): a [VitePress](https://vitepress.dev) site whose guide pages are hand-written and whose API reference is generated from the library's source by [TypeDoc](https://typedoc.org). See the root [`AGENTS.md`](../../AGENTS.md) for repo-wide rules and [`CONTEXT.md`](../../CONTEXT.md) for the domain glossary the pages use (`Schema`, `Result`, `Issue`, `Refinement`, `Transform`, `Coercion`).

It documents `@pvl/schema` only. `@pvl/schema-compiler` has no implementation yet, so it has nothing to document.

**Deployment is not set up here** — this package builds and previews a site locally and stops there. Hosting it is [issue #59](https://github.com/Ota-Prokopec/pvl/issues/59).

## Technology

- TypeScript, ESM (see root `AGENTS.md` Core Rules). The hand-written TypeScript here is `content/.vitepress/config.ts` and `scripts/`, which extracts the documentation's code examples for `check-types`. `scripts/` is run by Node's own type stripping (`node scripts/extractDocExamples.ts`), which is why `tsconfig.json` sets `allowImportingTsExtensions` — Node needs the real `.ts` extension in a relative import.
- VitePress `1.6.4`, TypeDoc `0.28.x` with `typedoc-plugin-markdown` and `typedoc-vitepress-theme`. All three are pinned: VitePress 2.x exists only as an alpha with moving config and theme APIs, and the two TypeDoc plugins peer-depend on `typedoc: 0.28.x`.
- Tooling depends on the shared `@repo/eslint-config` (`base`) and `@repo/typescript-config` (`base.json`), as everywhere else.
- `@pvl/schema` is a real `workspace:*` dependency — see "Why the workspace dependency is declared" below.

## The documentation's code examples are typechecked

Every fenced `ts` block in `content/guide/` and every TSDoc `@example` in `packages/schema/src` is compiled by this package's `check-types`. A snippet that no longer matches the API fails `pnpm check-types` instead of shipping a documented call that does not exist. Examples are **not executed** — compilation is the cheap check that catches the realistic failure mode, a renamed or re-signatured API. See [ADR-0015](../../docs/adr/0015-documentation-examples-are-typechecked-not-executed.md).

`scripts/extractDocExamples.ts` walks both sources and writes one file per snippet into `examples/`; `scripts/docExamples.ts` beside it is the pure parsing and rendering logic, covered by `tests/docExamples.test.ts`. `check-types` runs the extraction first, then compiles `examples/` through `tsconfig.examples.json`.

- **`examples/` is generated and is not committed** — same rules as `content/api/`. Never edit a file in it; edit the documentation the header comment points at.
- Each generated file starts with `// Generated from <source>:<line>.`, so a `tsc` error in `examples/guide/schemas-L169.ts` is read by opening that file and following its header back to the guide.

### How a snippet relates to the ones around it

A guide page reads top to bottom, so its snippets are not all self-contained. Two rules reproduce that:

- **Imports accumulate.** Every import any snippet on the page has shown is in scope for the snippets after it, because a reader has already seen it. This is why `content/guide/schemas.md` opens with a bare `import { pvl }` block and no later snippet repeats it.
- **Declarations do not**, unless the snippet says so. Each snippet is compiled in its own block scope, so two snippets are free to both use the name `user` for unrelated things — which they do.

A snippet whose declarations a later snippet builds on is marked ` ```ts docs-check-shared `, which puts its code at the top level of every fixture generated from the rest of that page. Four blocks currently need it; prefer a self-contained snippet over reaching for the marker.

### Opting a snippet out

` ```ts docs-check-skip ` leaves a snippet out of the fixtures. It is for code that is deliberately not valid — pseudo-code, or a chain shown precisely because the compiler rejects it (the `Modifiers` callout in `schemas.md` does this). Reach for it only when the snippet is _meant_ not to compile; a snippet that fails because the API moved is the harness working.

Markers go after the language in the fence info string. VitePress reads a block's language as everything up to the first space, so a marker never reaches the rendered page.

Two rules keep the default — "a snippet is checked" — from ever being lost by accident:

- **A token starting `docs-check-` that is not a known marker is an error**, not a silently ignored typo. A misspelled `docs-check-skip` would otherwise leave a snippet checked that was meant to be exempt, or worse, look exempt while being checked.
- **The language token is normalized the way VitePress normalizes it.** VitePress lets a fence carry its highlighting options on the language itself — `ts:line-numbers`, `ts:line-numbers=2`, `ts{1,3}`, `ts-vue` — and all of those are still `ts` blocks that get checked. Recognising only a bare `ts` would silently drop them, which is exactly the failure the opt-out design exists to prevent. `extractFenceLanguage` in `scripts/docExamples.ts` mirrors VitePress's own `extractLang`; keep them in step if VitePress adds a form.

### `@standard-schema/spec` and `vite` are declared for this

`@standard-schema/spec` is a devDependency because the guide's type-inference section imports it — the snippet has to resolve for real. `vite` is declared only to satisfy `vitest`'s peer dependency: VitePress depends on its own `vite` 5 and is unaffected by the newer copy sitting beside it.

## This package pins its own TypeScript

`apps/docs` declares `typescript: ~5.9.3`, while the rest of the repo is on `7.0.2`. This is deliberate: TypeDoc does not accept TypeScript 7, and 5.9 is the newest stable release it does accept. pnpm isolates the dependency, so only the doc generator sees it.

**Do not "fix" this by aligning it with the root pin** — TypeDoc fails at runtime against 7.0.2, not at install time, so the failure would look like a TypeDoc bug. The full reasoning, the rejected alternatives, and the trigger for reverting it are in [ADR-0014](../../docs/adr/0014-typedoc-pinned-to-typescript-5-9.md).

The practical consequence: TypeScript-7-only syntax in `packages/schema/src` will break documentation generation. If `docs:api` starts failing on syntax the rest of the repo compiles fine, that is this pin talking.

The same 5.9 is what compiles the extracted examples, and for the examples that is a feature rather than a compromise: they are consumer code, so checking them with the oldest TypeScript this repo still installs is the conservative direction. A snippet that needs 7-only types would be a snippet a reader on 5.9 cannot use. [ADR-0015](../../docs/adr/0015-documentation-examples-are-typechecked-not-executed.md) records this and the trigger for revisiting it.

## The content root is `content/`, not the package root

VitePress is pointed at `content/`, so only what lives there becomes a page. `package.json`, `typedoc.json`, `tsconfig.json` and this file stay out of the site's page space by construction.

Keep it that way. With the content root at the package root, this `AGENTS.md` would publish as `/AGENTS`, and the alternative — a negative `srcExclude` list — silently breaks the next time a root-level markdown file is added.

## `content/api/` is generated, and is not committed

TypeDoc writes `content/api/` — one page per exported symbol, plus `typedoc-sidebar.json` — from `packages/schema/src/index.ts`. The directory is listed in the root `.gitignore` and `.prettierignore`.

- **Never edit a file under `content/api/`.** The next `docs:api` run overwrites it.
- **Never commit that directory.** Committed generated markdown produces a large meaningless diff on every TSDoc tweak, and rots silently when someone forgets to regenerate.
- To change what the reference says, change the TSDoc in `packages/schema/src` — see that package's `AGENTS.md` for the TSDoc convention.

`docs:api` runs as a pre-step of **both** `dev` and `build`, so a fresh clone can run `pnpm docs:dev` with no extra step.

### The two sidebars differ on purpose

The guide sidebar in `content/.vitepress/config.ts` is hand-written: two stable, deliberate pages. The API sidebar is read from the generated `typedoc-sidebar.json` at config-load time. A hand-written sidebar over generated content is guaranteed to drift, and because the output is gitignored, nobody would see the drift in review.

It is read off disk rather than `import`ed so that `tsc --noEmit` does not fail on a clean checkout that has not generated the API yet.

## TypeDoc reads source, not `dist`

The entry point is `packages/schema/src/index.ts`, with `tsconfig` pointing at that package's own `tsconfig.json`. Two reasons: there is no build dependency to sequence, and TSDoc on internal members stays visible to TypeDoc, so `excludeInternal` actually filters — declaration output strips some of that context.

### Why the workspace dependency is declared

TypeDoc reads the schema source directly and does not need the built package, but without `"@pvl/schema": "workspace:*"` in `package.json`, Turborepo has no graph edge and will not invalidate the docs cache when the library's TSDoc changes. The dependency is also honest: the guide's code examples import `@pvl/schema`.

## Scripts

| Script                 | What it does                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `docs:api`             | TypeDoc → `content/api/`. Safe to run on its own while writing TSDoc.                   |
| `dev`                  | `docs:api`, then `vitepress dev content`. Reached from the root as `pnpm docs:dev`.     |
| `build`                | `docs:api`, then `vitepress build content`. Reached from the root as `pnpm docs:build`. |
| `lint`                 | ESLint, shared config, `--max-warnings 0`.                                              |
| `examples:extract`     | Writes the documentation's snippets into `examples/`. Safe to run on its own.           |
| `check-types`          | `examples:extract`, then both `tsc` projects below.                                     |
| `check-types:package`  | `tsc --noEmit` over the VitePress config, `scripts/` and `tests/`.                      |
| `check-types:examples` | `tsc --noEmit` over the generated `examples/`.                                          |
| `test`                 | Vitest over `tests/` — the extraction logic only.                                       |

The multi-step scripts compose named steps with `npm-run-all`'s `run-s` rather than `&&`, per [`docs/standards/turborepo.md`](../../docs/standards/turborepo.md).

The site itself is still not unit-tested, and that remains a decision rather than an omission — `apps/playground` sets the same precedent, and a VitePress page has no seam worth asserting on. The `test` script covers exactly one thing: the example-extraction logic in `scripts/`, which is ordinary code with parsing and error paths like any other. The seams that cover the site are `check-types`, `lint`, and `build` itself, which fails on a dead internal link.

## Guide content

Exactly two pages, and adding a third is a decision worth making deliberately rather than by accident:

- `content/guide/getting-started.md` — installing, a first schema, reading a `Result`, type inference.
- `content/guide/schemas.md` — one section per schema type, then the shared modifiers.

An error-handling deep dive, Standard Schema interop, and anything about `@pvl/schema-compiler` are deliberately not here yet.

The getting-started page opens with a `::: warning` callout stating that `@pvl/schema` is unpublished. **Delete that callout on the first npm release** — it exists so the `pnpm add @pvl/schema` line above it does not silently fail for a reader.

## Coding style / best practices

- Follow [`docs/standards/typescript.md`](../../docs/standards/typescript.md) for the VitePress config, and [`docs/standards/turborepo.md`](../../docs/standards/turborepo.md) for script wiring.
- Use the vocabulary the library's own code uses (`validate()`, `Result`, `Issue`), not a paraphrase of it.
- Prose in the guide describes what the library does today. A capability that does not exist yet — compiled validators, async validation — is either absent or named as absent, never implied.
