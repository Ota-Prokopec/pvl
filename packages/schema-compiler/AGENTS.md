# `@pvl/schema-compiler`

The ahead-of-time compiler for `@pvl/schema`. Turns a `Schema` marked with `pvl.compile(...)` into a `Compiled Validator`: a plain-JS function built from `Instruction`s instead of one that walks the schema tree at runtime. This directory is currently empty except for this file — implementation hasn't started yet; this documents the conventions it will be built under. See the root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for how this package relates to `@pvl/schema`, and [`CONTEXT.md`](../../CONTEXT.md) for the domain glossary (`AOT Compilation`, `Compiled Validator`, `Instruction`) referenced throughout this file.

## Technology

- TypeScript, ESM source (see root `AGENTS.md` Core Rules). Depends on `@pvl/schema` and [ts-morph](https://github.com/dsherret/ts-morph) (see the `ts-morph-analyzer` skill).
- Built and published with tsup (see the `tsup` skill), emitting **both** ESM and CJS output — see [ADR-0004](../../docs/adr/0004-dual-esm-cjs-publish-via-tsup.md).

## Architecture

### Discovery: static AST analysis, not dynamic import

This package never runs or imports the user's schema code. It statically parses the TS/JS source of files under directories declared in the user's `pvlconfig.json`, using ts-morph, looking for `pvl.compile(...)` call expressions. See [ADR-0002](../../docs/adr/0002-static-ast-compilation-via-ts-morph.md) for why (never executing user code; the trade-off is that only statically-resolvable schema expressions are compilable).

### Compilation unit: exactly what `pvl.compile()` wraps

`pvl.compile()` is per-call-site: each call produces its own standalone `Compiled Validator` for exactly the schema it wraps, whether that's a whole top-level schema (`pvl.compile(pvl.object({...}))`) or one nested field (`pvl.object({ key: pvl.compile(pvl.object({...})) })`). It only accepts a composite schema (`object`/`array`) — `@pvl/schema` rejects wrapping a bare primitive at the type level, since compiling a single primitive has no tree to flatten. Compiling a nested field does **not** reach up and compile its containing schema — the parent stays an ordinary interpreted `Schema` regardless; if a fully-compiled top-level schema is wanted, wrap the top-level schema itself. `Refinement`/`Transform` functions attached to a compiled schema are arbitrary user code this package can't turn into `Instruction`s by inlining their logic: the compiler inlines only the *structural* checks (type guards, required-field checks, array iteration) as `Instruction`s, and emits a call to the original refinement/transform function, imported by reference into the generated code, wherever one is attached.

### Output: dev vs. production, gated by `pvlconfig.json`'s `production` flag

For each `pvl.compile(...)` call site, this package always emits a **separate generated file** (e.g. `<name>.generated.ts`) exporting the corresponding `Compiled Validator`. What else it does depends on the `production` flag in `pvlconfig.json`:

- **`production: false`** (dev, default): that's it. Tracked source is never touched; a compiled export is something the consumer opts into explicitly by importing it.
- **`production: true`** (CI/build): the compiler additionally rewrites `pvl.compile(...)` call sites to reference the compiled output — but only in the app's **build output** (e.g. its `dist/`, or whatever its bundler consumes), never in its tracked `.ts` source. This is how a shipped app ends up with zero-import-friction fast validation without the compiler ever risking a developer's actual repository state. See [ADR-0005](../../docs/adr/0005-production-mode-gates-build-output-rewrite.md).

### Every `Compiled Validator` conforms to `StandardSchemaV1`

Per [ADR-0003](../../docs/adr/0003-compiled-validators-conform-to-standard-schema.md): a `Compiled Validator` exposes its own `"~standard"`, reporting `vendor: "@pvl/schema"` (not `"@pvl/schema-compiler"` — it represents the same schema, just executed differently; see [`docs/specification/standard-schema.md`](../../docs/specification/standard-schema.md)). The underlying `validate` is still the fast `Instruction` sequence; conformance is a thin wrapper, not a performance cost.

## Coding style / best practices

- Follow [`docs/standards/typescript.md`](../../docs/standards/typescript.md) for all TypeScript conventions.
- Generated output is a build artifact: keep the templates/codegen that produce it easy to diff and reason about, since it's the thing users will actually read when debugging a compiled validator.

## Open questions

- **`pvlconfig.json`'s full shape**: known so far — directories to scan for `pvl.compile()` call sites, and a `production: boolean` flag (see above). Output directory for generated files and any other settings aren't defined yet.
