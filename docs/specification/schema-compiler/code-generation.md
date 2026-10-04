# Code generation

What the code `@pvl/schema-compiler` emits looks like. Read this before you write or change an emit template.

## Inline within a node, delegate at composite boundaries

Straight-line JavaScript: literal `if`/`for` statements, no interpreter loop and no `new Function`. Primitive checks are inlined within a node; at a composite boundary the parent calls that child's own `_validate` rather than re-inlining its body, so output size stays linear in schema size instead of multiplying with nesting depth. See [ADR-0017](../../adr/0017-inline-with-delegation-code-generation.md).

## Each Compiled Schema is a `Schema` subclass

The emitted code defines, per Compiled Schema, a subclass of `@pvl/schema`'s `Schema` whose `_checkType` is the generated code. [`schema/compile.md`](../schema/compile.md) holds the contract that class fills: empty modifier arrays, every `Issue` reported at the `path` it is handed, and a typed surface identical to what `pvl.compile()` returns before compilation, so the import swap is a drop-in at the type level too. It inherits `"~standard"` and reports `vendor: "@pvl/schema"` ([`standard-schema.md`](../standard-schema.md#conformance-rules)).

## Issues are literals, so the differential test is load-bearing

Each `Issue` ([ADR-0011](../../adr/0011-result-failure-branch-carries-pvl-issue.md)) is constructed with its code, message and path written out as literals. Nothing but the differential test against the interpreted path keeps them right, which is why that test is load-bearing, not optional.
