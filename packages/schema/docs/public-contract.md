# The public contract

What `validate()` and `"~standard"` promise every consumer. Read this before you touch `validate()`, `"~standard"`, `Result` or `Issue`.

## Standard Schema conformance

Every schema implements [`StandardSchemaV1`](../../../docs/specification/standard-schema.md) — [ADR-0001](../../../docs/adr/0001-adopt-standard-schema.md). `"~standard"` carries `version: 1`, `vendor: "@pvl/schema"` exactly, populated `types` (phantom `Input`/`Output`, so `StandardSchemaV1.InferInput`/`InferOutput` work for any schema built here), and a synchronous `validate`. A `Compiled Schema` compiled from these schemas reports the same `vendor`, being meant to be indistinguishable from the schema it came from ([ADR-0003](../../../docs/adr/0003-compiled-schemas-conform-to-standard-schema.md)).

The internal validation result representation and `StandardSchemaV1.Result` are one shape — never two parallel representations kept in sync by hand. `Result`'s failure branch is the spec's own `FailureResult` intersected with this package's `Issue`, so `Issue.code` is readable by consumers while the type stays derived from the spec rather than re-declared beside it ([ADR-0011](../../../docs/adr/0011-result-failure-branch-carries-pvl-issue.md)). Nested object/array/union failures populate `Issue.path` with the failing field's location; a top-level scalar failure may omit `path`.

## `validate()` — synchronous only

`.validate(value)` always returns `Result` synchronously and never throws for an invalid value — thrown errors are reserved for programmer error (e.g. malformed schema construction). There is no `.validateAsync()` and no async `Refinement`/`Transform` in v1: async validation has no coherent meaning at the schema level, so it is unsupported outright rather than half-supported behind a second method. A caller with an inherently async check (e.g. a uniqueness check against a database) awaits it themselves and calls `.validate()` on the resolved value.

`.validate()` never awaits or unwraps the value passed to it — a `Promise` is just an invalid value for whatever the schema expects, not something `.validate()` resolves on the caller's behalf.
