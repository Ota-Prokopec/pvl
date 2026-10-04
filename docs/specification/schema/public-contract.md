# The public contract

What `validate()` and `"~standard"` promise every consumer. Read this before you touch `validate()`, `"~standard"`, `Result` or `Issue`.

## Standard Schema conformance

Every schema implements `StandardSchemaV1`. [`docs/specification/standard-schema.md`](../standard-schema.md#conformance-rules) holds the conformance rules: the `vendor`, the populated `types`, `Issue.path`, and the single `Result` representation.

## `validate()` — synchronous only

`.validate(value)` always returns `Result` synchronously and never throws for an invalid value — thrown errors are reserved for programmer error (e.g. malformed schema construction). There is no `.validateAsync()` and no async `Refinement`/`Transform` in v1: async validation has no coherent meaning at the schema level, so it is unsupported outright rather than half-supported behind a second method. A caller with an inherently async check (e.g. a uniqueness check against a database) awaits it themselves and calls `.validate()` on the resolved value.

`.validate()` never awaits or unwraps the value passed to it — a `Promise` is just an invalid value for whatever the schema expects, not something `.validate()` resolves on the caller's behalf.
