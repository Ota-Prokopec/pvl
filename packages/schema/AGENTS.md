# `@pvl/schema`

A Zod-style schema validation library. Compose `Schema`s and validate values against them at runtime. This directory is currently empty except for this file — implementation hasn't started yet; this documents the conventions it will be built under. See the root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for how this package relates to `@pvl/schema-compiler`, and [`CONTEXT.md`](../../CONTEXT.md) for the domain glossary (`Schema`, `Issue`, `Parse Result`, `Refinement`, `Transform`, `Coercion`) referenced throughout this file.

## Technology

- TypeScript, ESM source (see root `AGENTS.md` Core Rules). No runtime dependencies.
- Built and published with tsup (see the `tsup` skill), emitting **both** ESM and CJS output — see [ADR-0004](../../docs/adr/0004-dual-esm-cjs-publish-via-tsup.md). The dual output is a publish-target concern only; source stays ESM.

## Architecture

### Schema surface (v1 scope)

Primitives (`string`, `number`, `boolean`), `object`, `array` (including nested combinations of these), `optional`, `nullable`, `union`, `literal`, `enum`. Recursive/self-referential schemas and `record`/`tuple`/`intersection` are deferred past v1.

### Refinements, Transforms, Coercion

All three are supported in v1 (see `CONTEXT.md` for the precise distinction between them):

- **Refinement**: `(data) => boolean` predicates attached to a schema, e.g. `myCustomValidationFunction`. Never change the value.
- **Transform**: functions that convert a schema's accepted value into a different `Output` value (`Input !== Output`), run as part of producing the `Parse Result`.
- **Coercion**: opt-in conversion of the raw input value to the schema's target type, run *before* the schema's own checks.

### Standard Schema conformance

Every schema this package produces implements [`StandardSchemaV1`](../../docs/specification/standard-schema.md) — see [ADR-0001](../../docs/adr/0001-adopt-standard-schema.md). `vendor` is the literal string `"@pvl/schema"`; this is also the `vendor` value reported by *compiled* validators produced by `@pvl/schema-compiler` from this package's schemas — a compiled validator is meant to be indistinguishable from the schema it was compiled from (see [ADR-0003](../../docs/adr/0003-compiled-validators-conform-to-standard-schema.md)).

Internal validation result representation and `StandardSchemaV1.Result` must be the same shape — don't maintain two parallel representations kept in sync by hand.

### `validate()` — synchronous only, no async support in v1

`.validate(value)` always returns `Result` synchronously. There is no `.validateAsync()` and no async `Refinement`/`Transform` in v1: async validation doesn't have a coherent meaning at the schema level (what would "validating" a not-yet-resolved value even do?), so it isn't supported at all, rather than being half-supported behind a second method. A caller with an inherently async check (e.g. a uniqueness check against a database) awaits it themselves and calls `.validate()` on the resolved value.

`.validate()` never awaits or unwraps a value passed to it as the thing being checked — a `Promise` passed as the input value is just an invalid value for whatever the schema expects (same as passing any other wrong-shaped value), not something `.validate()` resolves on the caller's behalf.

### `pvl.compile()`

This package exports `compile()`, used to mark a schema as a candidate for ahead-of-time compilation, e.g. `pvl.object({ key: pvl.compile(pvl.object({ ... })) })`. It only accepts a **composite schema** (`object` or `array`) — wrapping a bare primitive like `pvl.compile(pvl.string())` is forbidden (compiling a single primitive has no tree to flatten, so there's nothing to gain; `@pvl/schema` should reject this at the type level, and `@pvl/schema-compiler` should also flag it if it somehow gets past that). At runtime, before compilation, `compile()` behaves as an identity function — it returns its argument schema unchanged, so a schema file that uses it but hasn't been through the compiler still validates correctly via the normal interpreted path. See `@pvl/schema-compiler`'s `AGENTS.md` for what happens once the compiler *has* processed a call site (still being finalized).

## Coding style / best practices

- **Primitive validators must be written for raw speed** — no regex or other comparatively slow techniques. They're both the runtime hot path for every schema built on top of them and the performance baseline `@pvl/schema-compiler`'s compiled output is trying to beat.
- Follow [`docs/standards/typescript.md`](../../docs/standards/typescript.md) for all TypeScript conventions.

## Open questions

- Nothing package-specific currently open — see the root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) "Still open" section for cross-cutting items (mainly about `@pvl/schema-compiler`'s partial-compilation behavior, which affects how consumers of this package would opt into compiled output).
