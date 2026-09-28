# The documentation's code examples are typechecked, not executed

Every public member of `@pvl/schema` carries a TSDoc `@example`, and the two guide pages in [`apps/docs`](../../apps/docs/AGENTS.md) are largely code. None of it was checked by anything. A renamed method or a changed signature left the documentation confidently showing an API that no longer exists, and because the API reference is generated from that same TSDoc, the wrong call would be republished on every build. Examples that lie are worse than no examples.

**Compilation is the check.** The snippets are extracted into one TypeScript file per snippet under `apps/docs/examples/`, which `apps/docs`'s `check-types` compiles. A snippet that no longer matches the API fails `pnpm check-types` rather than shipping. Nothing is executed and nothing asserts on a value.

That boundary is the decision. Executing the examples as tests would additionally catch semantic drift — an example whose stated output changed while still compiling — but it costs much more than it returns here. The realistic failure mode for a library's examples is a renamed or re-signatured API, which compilation catches completely; and an example carrying runtime assertions stops reading like the illustration it exists to be, since the `// { value: 'ada' }` comment a reader wants would have to become an `expect`. The library's own behavior is already covered exhaustively by `packages/schema/tests`, so execution here would mostly re-assert what that suite asserts, against worse-written cases. Revisit if a documented output is found to have drifted while still compiling.

**Extraction rather than a doc-comment test runner.** The snippets live in two different kinds of source — TSDoc comments and Markdown fences — so a single extraction step that normalizes both into plain TypeScript keeps one mechanism instead of two. It also means the check is `tsc`, with no dependency on a documentation-testing tool that would need its own pinning against TypeDoc and VitePress.

## Guide snippets are compiled the way a page is read

A guide page is prose, so its snippets are not self-contained, and forcing them to be would make the documentation worse to read. Two rules reproduce a reader working down the page:

Imports accumulate across a page — a snippet may use anything an earlier snippet imported, because the reader has already seen it. Declarations do not: each snippet compiles in its own block scope, so two snippets may both name something `user` without colliding, and only a snippet explicitly marked `docs-check-shared` puts its declarations in scope for the ones after it.

The alternative — one fixture per page, everything flat — fails on the first page that reuses a variable name, which both guide pages do. The alternative of demanding every snippet repeat its imports would put `import { pvl } from '@pvl/schema';` on top of two dozen blocks that read better without it.

## Opting out is a fence marker

A snippet marked `docs-check-skip` is left out. It exists for code that is deliberately not valid: pseudo-code, or a chain shown precisely because the compiler rejects it. Markers are written after the language in the fence info string, which VitePress does not render, so the published page is unchanged.

Rejected alternatives: a magic comment inside the snippet would be visible to a reader, and an opt-_in_ marker was rejected because it makes silence mean "unchecked" — the default has to be that a snippet is verified, so that a newly added example is covered without anyone remembering to ask for it.

Because silence means "checked", every way of losing a snippet without an error is a defect in this design rather than a rough edge. Two follow from that. A token beginning `docs-check-` that is not a known marker is an error rather than being ignored, so a typo cannot quietly disable a check. And the fence's language token is normalized exactly as VitePress normalizes it — `ts:line-numbers`, `ts:line-numbers=2`, `ts{1,3}` and `ts-vue` are all `ts` — because recognising only a bare `ts` would silently skip a block a reader sees as TypeScript. The first version of this harness got that second point wrong, and the review that caught it is the reason it is written down here.

## The examples are compiled by TypeScript 5.9

`apps/docs` pins `typescript: ~5.9.3` for TypeDoc ([ADR-0014](./0014-typedoc-pinned-to-typescript-5-9.md)) while the rest of the repo is on `7.0.2`, so the extracted examples are compiled by 5.9. This was verified to work against declarations `7.0.2` emits, and it is the right direction rather than merely the convenient one: the examples are consumer code, and a reader on TypeScript 5.x must be able to compile them. Checking with the older compiler is the conservative choice, and a snippet needing 7-only types would be a snippet much of the audience cannot use.

Hosting the fixture in a separate workspace package purely to give it `typescript: 7.0.2` was rejected: it buys a compiler the audience may not have, and costs a package with its own `package.json`, lint config and `AGENTS.md`.

**Revisit when `apps/docs` rejoins the repo-wide TypeScript pin** — that happens on its own when ADR-0014's trigger fires, and needs no change here.

## Consequences

- `apps/docs` gains a `test` script, covering the extraction logic in `scripts/` only. The site itself is still deliberately untested.
- `@standard-schema/spec` becomes a devDependency of `apps/docs`, because the guide's type-inference snippet imports it and that import now has to resolve.
- `vite` becomes a devDependency of `apps/docs`, satisfying `vitest`'s peer range. VitePress depends on its own `vite` 5 and is unaffected.
- `apps/docs/examples/` is generated, gitignored and prettier-ignored, on the same terms as `content/api/`.
- Wiring the harness up immediately found a real defect: the `Modifiers` callout in `guide/schemas.md` claimed that chaining a modifier before a constraint "fails silently", when in fact every modifier returns the base `Schema`, which has no constraint methods, so TypeScript rejects it outright. The runtime drop the callout describes is real, but only a plain-JavaScript caller ever reaches it. The callout was corrected.
