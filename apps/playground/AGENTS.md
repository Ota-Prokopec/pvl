# `playground`

A private, committed scratch app for watching [`@pvl/schema`](../../packages/schema/AGENTS.md) work: one entry module (`src/index.ts`) that composes a series of Schemas, validates one passing and one failing value against each, and prints a legible, sectioned report to stdout. See [`CONTEXT.md`](../../CONTEXT.md) for the domain terms it uses (`Schema`, `Result`, `Issue`, `Refinement`, `Transform`, `Coercion`).

It is **not** documentation, a README example set, or a test suite. It exists so "what happens if I do this?" can be answered by editing a file and re-running instead of by writing a throwaway test and deleting it. Edit it, mangle it, delete whole sections — nothing asserts on its output.

## Technology

- TypeScript, ESM.
- Compiled with `tsc` to `dist/` — deliberately _not_ bundled, since the app has no consumers and a plain compile already yields output Node runs directly.
- Run under [tsx](https://tsx.is) for the `dev`/`start` scripts: `dev` is `tsx watch`, re-running the whole tour on every edit to this app _or_ to `@pvl/schema`'s source; `start` runs it once. `build`, `lint` and `check-types` are as everywhere else; there is deliberately no `test` script (see below).

## A build must precede running this app

`pnpm start` and `pnpm dev` fail with a module-resolution error for `@pvl/schema` unless that package has been built at least once (`pnpm build` from the repo root, or `pnpm --filter @pvl/schema build`). **This is a known consequence of a deliberate choice, not a defect — do not "fix" it by reaching into the library's source.**

The reason: this app depends on `@pvl/schema` as an ordinary workspace dependency and imports it by package name, through its public entry point. The alternative — mapping the import to the library's `src/` via TypeScript path aliases — would remove the build step and always reflect current source, but would bypass the package's declared `exports` and so never catch a packaging or declaration-emit mistake. Exercising the real import path won, and this caveat is the price.

Two consequences follow, both already wired up:

- The root Turborepo `check-types` task depends on `^build`, so a clean clone can type-check. Without it, this app's type-check runs before its dependency has emitted any declarations.
- No `start` task exists in the root `turbo.json`, so running this app is a filtered, manual command. `dev` _is_ a root task and this app opts into it — the repo-wide `pnpm dev` reprints the tour whenever the library's source changes, which is the intended feedback loop.

## Architecture

**One file, read top to bottom.** `src/index.ts` is the only source file; there is no module decomposition, because being small enough to read in one sitting is the feature.

**Ten sections, in a fixed order** — primitives; `literal`/`enum`; object; array; union; `optional()`/`nullable()`; Refinement; Transform; Coercion; and an object containing an array of objects as the finale. Types come first, then the modifiers that wrap them, with Transform and Coercion adjacent so the after-validation versus before-validation distinction is directly comparable rather than inferred from the glossary. The deep-nesting section is last because it is where the `path` machinery is most visible.

**Every section builds its own Schema.** No Schema is carried down the file accumulating modifiers, so any section can be copied, rewritten or deleted without untangling it from the others.

**The output contract lives in one small `report` helper** in that same file. Raw `Result` objects are never printed — the Standard Schema envelope buries the interesting part. Two line shapes:

```
✓ { name: "Ada", age: 36 }
✗ tags[0] [INVALID_TYPE]: expected string
```

A success prints the accepted value, which after a Transform is the transformed value rather than the input. A failure prints one line per `Issue`: the `path` in dotted notation with array indices in brackets, then the `IssueCode`, then the message. An `Issue` with no `path` (one reported at the root) prints without the path segment.

The accepted value is rendered with `node:util`'s `inspect` rather than `JSON.stringify`, which throws on a `bigint` — section 1 validates one, so that is load-bearing. The visible cost is Node-style single-quoted strings rather than the double quotes in the sketch above. That trade is deliberate; don't "fix" the quoting at the price of `bigint` support.

**Example data is deliberately throwaway** — a name, an age, a role from an enum, a string array of tags, an optional nested address. It exists to be recognizable at a glance, not to model a real domain, and nothing here is a canonical usage guide.

**Not demonstrated on purpose:** `pvl.compile()`, an identity function until `@pvl/schema-compiler` has an implementation, which would imply capability that does not exist; and the raw `"~standard"` property, since the tour uses `validate()`, which is what a consumer reaches for.

## No tests

**This app has no automated tests, and that is a decision, not an omission.** It does not participate in the repo-wide `test` task. A test here would have to assert on printed output, so every experiment — the entire point of the app — would break a test, and assertions would make a scratch surface precious.

The seams that do apply:

- **Type-checking is the primary automated seam.** This app compiles against `@pvl/schema`'s _emitted declarations_, reached through its declared `exports`. The library's own tests import from source within the same package, so they cannot catch a broken export map, a missing declaration, or a type that only resolves intra-package. This app catches all three, and `pnpm check-types` runs it.
- **Linting**, as everywhere else.
- **Running the program and reading stdout** is the behavioral seam — manually, and intentionally so.

## Rules

- Use the vocabulary the library's code uses (`validate()`, `Result`, `Issue`), not a paraphrase of it.
- The package name is the bare word `playground`, outside both the published `@pvl/*` namespace and the internal `@repo/*` one, and the package is `private`. Keep it that way: nothing here should ever look shippable.
