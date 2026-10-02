# `@pvl/schema-compiler`

The ahead-of-time compiler for `@pvl/schema`. Turns a `Schema` marked with `pvl.compile(...)` into a `Compiled Schema`: a [Standard Schema](../../docs/specification/standard-schema.md)-conformant object whose `validate` runs emitted `Instruction`s instead of walking the schema tree at runtime. This directory is currently empty except for this file — implementation hasn't started yet; this documents the conventions it will be built under. See the root [`MONOREPO.md`](../../MONOREPO.md) for how this package relates to `@pvl/schema`, and [`CONTEXT.md`](../../CONTEXT.md) for the domain glossary (`AOT Compilation`, `Compiled Schema`, `Instruction`, `Destination File`, `Standalone Key`) referenced throughout this file.

## Technology

- TypeScript, ESM source (see root `AGENTS.md` Core Rules). Depends on `@pvl/schema` (for validating its own configuration), [ts-morph](https://github.com/dsherret/ts-morph) for AST work (see the `ts-morph-analyzer` skill), yargs for the CLI, and tsup for building the default destination.
- Built and published with tsup (see the `tsup` skill), emitting **both** ESM and CJS output — see [ADR-0004](../../docs/adr/0004-dual-esm-cjs-publish-via-tsup.md).

### Discovery: static AST analysis, not dynamic import

This package never runs or imports the user's schema code. It statically parses the TS/JS source of the files matched by `include` in the user's `pvlconfig.json`, using ts-morph, looking for `pvl.compile(...)` call expressions. See [ADR-0002](../../docs/adr/0002-static-ast-compilation-via-ts-morph.md) for why (never executing user code; the trade-off is that only statically-resolvable schema expressions are compilable, and marking one that isn't is an error rather than a silent fallback).

### Compilation unit: exactly what `pvl.compile()` wraps

`pvl.compile()` is per-call-site: each call produces its own `Compiled Schema` for exactly the schema it wraps, whether that's a whole top-level schema (`pvl.compile(pvl.object({...}))`) or one nested field (`pvl.object({ key: pvl.compile(pvl.object({...})) })`). It only accepts a composite schema (`object`/`array`) — `@pvl/schema` rejects wrapping a bare primitive at the type level, since compiling a single primitive has no tree to flatten. Compiling a nested field does **not** reach up and compile its containing schema — the parent stays an ordinary interpreted `Schema` regardless; if a fully-compiled top-level schema is wanted, wrap the top-level schema itself.

Every modifier is applied **before** compiling and baked into the emitted code, in the same chain order around the type check as the interpreted path runs them ([ADR-0010](../../docs/adr/0010-modifiers-run-in-chain-order-around-the-type-check.md)): pre-modifiers (`.optional()`, `.nullable()`, `.coerce()`) before the type check, post-modifiers (Constraints, `.refine()`, `.strict()`/`.passthrough()`, then `.transform()`) after it, with the same short-circuit and collection rules. `.refine()`/`.transform()` become calls to the user's own functions, imported by reference into the `Destination File`. Those functions are arbitrary user code and are never inlined or compiled — only the _structural_ checks (type guards, required-field checks, array iteration) become `Instruction`s. Nothing can be attached to a `Compiled Schema` afterwards; see [ADR-0016](../../docs/adr/0016-transform-and-compile-return-read-only-schemas.md).

### Output: one `Destination File`, and nothing is ever rewritten

This package writes a single **`Destination File`** and modifies nothing else — not the developer's tracked source, not their build output, in any mode. There is no `production` flag. Adopting a `Compiled Schema` is one import-path change the developer makes by hand (`from './schemas/user.js'` → `from '@pvl/compiled-schemas'`). See [ADR-0005](../../docs/adr/0005-compiler-emits-a-destination-file-and-rewrites-nothing.md).

The `Destination File` is a **complete mirror** of the scanned set — see ADR-0005 for why. What that costs this package: ts-morph rewrites imports and re-exports so they resolve from the new location; an import whose target is itself in the scanned set collapses into a direct in-file reference and its import statement is dropped. Modules are emitted in sorted path order under a banner naming each source file, behind a `@generated` header, and output is byte-stable across runs with unchanged input. `@pvl/schema` stays a runtime dependency of the `Destination File`: every `Compiled Schema` extends its `Schema` class, and the mirror carries ordinary interpreted schemas too.

Where the file lands is [ADR-0015](../../docs/adr/0015-compiled-schema-destination-resolution.md): with `destination` unset it goes to `<anchor>/node_modules/.pvl/compiled-schemas/` as ESM + CJS + declarations built with tsup, plus a `@pvl/compiled-schemas` symlink beside it; with `destination` set it is one plain TypeScript file and the consuming build owns compilation. `<anchor>` is the directory holding `pvlconfig.json` (or the working directory for a flags-only run), which is what keeps two applications in one workspace from overwriting each other. Read that ADR before proposing to expose the output through `@pvl/schema`'s own `exports` — three Node resolution rules make it impossible.

### Emitted code: inline within a node, delegate at composite boundaries

Straight-line JavaScript: literal `if`/`for` statements, no interpreter loop and no `new Function`. Primitive checks are inlined within a node; at a composite boundary the parent calls that child's own `_validate` rather than re-inlining its body, so output size stays linear in schema size instead of multiplying with nesting depth. Each `Issue` ([ADR-0011](../../docs/adr/0011-result-failure-branch-carries-pvl-issue.md)) is constructed with its code, message and path written out as literals, so nothing but the differential test against the interpreted path keeps them right — which is why that test is load-bearing, not optional. See [ADR-0017](../../docs/adr/0017-inline-with-delegation-code-generation.md).

### Every `Compiled Schema` is a `Schema` subclass, typed as a Read-only Schema

A `Compiled Schema` is an instance of a `@pvl/schema` `Schema` subclass whose `_checkType` is the emitted code ([ADR-0016](../../docs/adr/0016-transform-and-compile-return-read-only-schemas.md)). So it inherits `"~standard"`, reporting `vendor: "@pvl/schema"` (not `"@pvl/schema-compiler"` — it represents the same schema, just executed differently; see [ADR-0003](../../docs/adr/0003-compiled-schemas-conform-to-standard-schema.md) and [`docs/specification/standard-schema.md`](../../docs/specification/standard-schema.md)). Its typed surface is the Read-only Schema — `"~standard"` and `validate()` — plus `shape` / `element` when the compiled `object`/`array` ends in no `.transform()`. `shape` carries only the keys marked `.standalone()` (`Standalone Key`s), absent at both type and runtime otherwise, so a missing marker is a compile error rather than a runtime `undefined`; nested composites stay reachable through `shape`/`element` without any marking, since the emitted code already needs their validators. This is the one place the import swap is deliberately not a drop-in — the interpreted `shape` carries every key — and it belongs in user-facing documentation.

Because a `Compiled Schema` is a `Schema` subclass instance, it is a field of an interpreted schema like any other: the parent calls its `_validate` with the parent's path extended, so its `Issue`s carry their full path with no re-prefixing ([ADR-0018](../../docs/adr/0018-composite-fields-are-pvl-schemas-only.md)). The emitted class must therefore report every `Issue` at the `path` `_validate` hands it.

### Configuration and CLI

`pvlconfig.json` carries `$schema`, `include` (default `["src/schemas/**/*.ts"]`), `destination`, `withTypes` and `watch`. Its own schema is defined with `@pvl/schema` and the shipped `json-schema.json` is generated from that definition and exported under `./json-schema`, so the runtime check and the editor schema cannot drift. The destination path and `node_modules` are always excluded from `include`, so the compiler cannot read its own output. Relative paths resolve against the directory holding the config.

The CLI is `pvl compile`, built with yargs (see the `cli-developer` skill). Every setting is also a flag, plus `--config`, `--watch`, `--strict` and `--json`; precedence is flags, then config file, then defaults. **Nothing is written when any error fired** — a partially written `Destination File` that still typechecks is worse than no output.

Every diagnostic carries a stable, publicly documented code, so users and tests refer to codes rather than message text.

## Coding style / best practices

- Follow [`docs/standards/typescript.md`](../../docs/standards/typescript.md) for all TypeScript conventions.
- **Every emit template lives in this package.** A validation rule is split on purpose: its runtime half (`code`, `message`, `test`) sits in the `@pvl/schema` class, its codegen half (the source text emitted into the `Destination File`) sits here. Emit strings are never executed at runtime, and class members can't be tree-shaken, so placing them in `@pvl/schema` would ship dead weight in every consumer's bundle. The cost is that each constraint is written twice and the halves can drift, which the differential test catches.
- Generated output is a build artifact: keep the templates/codegen that produce it easy to diff and reason about, since it's the thing users will actually read when debugging a `Compiled Schema`.
