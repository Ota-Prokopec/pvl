# `playground`

A private scratch app for watching [`@pvl/schema`](../../packages/schema/AGENTS.md) work. `src/index.ts` composes a series of Schemas, validates one passing and one failing value against each, and prints a sectioned report. It answers "what happens if I do this?" by editing the file and re-running: edit, mangle or delete any section freely, since nothing asserts on its output. It is a scratch surface, never a usage guide.

## Build `@pvl/schema` before running it

`pnpm --filter playground start` and `dev` need `@pvl/schema` built at least once (`pnpm build`, or `pnpm --filter @pvl/schema build`); otherwise they fail to resolve the package. That is deliberate: the app imports the library by package name through its declared `exports`, so it exercises the real packaging and declaration output. A TypeScript path alias into the library's `src/` would skip the build and catch none of that, so keep the import as it is. The root `check-types` task depends on `^build` for the same reason.

## Shape of `src/index.ts`

- **One file, read top to bottom.** Being small enough to read in one sitting is the feature.
- **Every section builds its own Schema**, so any section can be copied, rewritten or deleted on its own.
- **One `report` helper owns the output.** A success prints the accepted value (after a Transform, the transformed one). A failure prints one line per `Issue`: the dotted `path` with array indices in brackets, the `IssueCode`, then the message.
- **Values print through `node:util`'s `inspect`**, because `JSON.stringify` throws on the `bigint` section 1 validates. Strings come out single-quoted as a result, and that's accepted.
- **`pvl.compile()` and the raw `"~standard"` property stay out of the tour.** `pvl.compile()` is an identity function until the compiler exists, so showing it would imply a capability that isn't there; a consumer reaches for `validate()`, not `"~standard"`.

## No tests, by decision

A test here would assert on printed output, so every experiment would break one. The automated seam is `check-types`: the app compiles against `@pvl/schema`'s emitted declarations, so it catches a broken export map or missing declaration that the library's own source-level tests can't. Running it and reading stdout is the behavioural check.

## Rules

- Use the library's own vocabulary (`validate()`, `Result`, `Issue`).
- The package stays `private` under the bare name `playground`, outside the `@pvl/*` and `@repo/*` namespaces, so nothing here ever looks shippable.
