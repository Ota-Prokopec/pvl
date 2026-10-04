# `pvl.compile()` and the compiler-facing surface

Read this before you touch `pvl.compile()`, `_checkType`, or how a composite calls its children. Everything here must stay aligned with [`@pvl/schema-compiler`](../../../packages/schema-compiler/AGENTS.md).

`compile()` marks a schema for ahead-of-time compilation, e.g. `pvl.object({ key: pvl.compile(pvl.object({ ... })) })`. It accepts **any schema** — primitive or composite, with any Modifier chained, `.transform()` included — so there is no candidate marker to keep in step with the Modifiers. At runtime, before compilation, it is an identity function — a schema file that uses it but hasn't been through the compiler still validates correctly through the interpreted path.

At the type level it returns a plain `Schema<InferInput<x>, InferOutput<x>>`; there is no `CompiledSchema` type. So `pvl.compile(x).optional()`, `pvl.compile(x).strict()` and `pvl.compile(x).shape` are compile errors. The supported spelling is `pvl.compile(x.optional())`, and a caller who wants to validate one field on its own keeps a reference to that field's schema ([ADR-0016](../../adr/0016-transform-and-compile-end-the-modifier-chain.md), [ADR-0020](../../adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md)). At runtime a Compiled Schema is a `Schema` subclass instance, not a `ChainableSchema` one, whose `_checkType` is the emitted code. An uncompiled schema stays fully editable.

What keeps that swap working, and must stay aligned with `@pvl/schema-compiler`:

- **Fields, elements and union members are `@pvl/schema` Schemas only**, typed as `Schema` so a transformed or compiled child fits, and called through their own `_validate` with the parent's path extended. A Standard Schema from another library is rejected at the type level ([ADR-0018](../../adr/0018-composite-fields-are-pvl-schemas-only.md)).
- **`_checkType` is the one hook a Compiled Schema fills in.** Every Modifier is baked into the emitted code, so its modifier arrays stay empty and the `_validate` it inherits reduces to `_checkType`, which must report every `Issue` at the `path` it is handed.

See [`schema-compiler/compilation.md`](../schema-compiler/compilation.md) for what the compiler does with a marked schema.
