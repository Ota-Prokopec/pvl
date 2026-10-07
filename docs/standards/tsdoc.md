# TSDoc is user-facing documentation, not contributor rationale

Read this before you write a doc comment in a published package, or export something new from one. Today that's `@pvl/schema`, whose source TypeDoc reads.

`/** */` TSDoc on anything reachable from a package's barrel (`src/index.ts`) **is** the published API reference: [`apps/docs`](../../apps/docs/AGENTS.md) generates `content/api/` from this source with TypeDoc, so whatever a TSDoc block says is what a consumer reads on the documentation site. Two rules follow.

**Write TSDoc for someone using the library, not maintaining it**: what the member accepts, what it hands back, and an `@example` importing from `'@pvl/schema'` that shows both a passing and a failing case where that is the interesting part.

**Contributor rationale belongs in `//` line comments, or in TSDoc tagged `@internal`.** "See ADR-0010", "phantom property", "resolved once at construction because this is the hot path" — none of that is documentation for a consumer, and in a plain TSDoc block it becomes the first thing they read. Put it in `//` comments, which TypeDoc never picks up, between the TSDoc block and the declaration.

Protocol plumbing (`_validate`, `_checkType`, `_coerceInput`, `"~standard"`, the `_with*Modifier` helpers, the schema class constructors the `pvl.*` factories exist to hide) stays documented for maintainers but tagged `@internal`, so TypeDoc's `excludeInternal` drops it from the reference. A file outside the barrel (`src/index.ts`) is never seen by TypeDoc, so its comments are for maintainers. Type plumbing inside the barrel is tagged `@internal`. Each file's top comment says which side it is on.

**Every `@example` is compiled by the build.** `apps/docs`'s `check-types` extracts each one into its own TypeScript file and typechecks it, without executing it ([ADR-0023](../adr/0023-documentation-examples-are-typechecked-not-executed.md)). So an `@example` stands on its own, imports included, and imports from `'@pvl/schema'` rather than by relative path. A snippet that is deliberately invalid opts out with ` ```ts docs-check-skip `.
