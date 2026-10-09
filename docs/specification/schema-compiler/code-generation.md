# Code generation

What the code `@pvl/schema-compiler` emits looks like. Read this before you write or change an emit template.

## Everything inlined into one `_checkType`

Straight-line JavaScript: literal `if`/`for` statements, no interpreter loop and no `new Function`. Every check of the whole Schema is inlined into one `_checkType`, nested Schemas included. The parent never calls a child's `_checkType`, for speed. Output therefore grows with the size of the whole tree ([ADR-0023](../../adr/0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md), superseding [ADR-0017](../../adr/0017-inline-with-delegation-code-generation.md)'s delegation).

## Emitters mirror `@pvl/schema`'s methods

The templates live in `src/compile/generate/emitters/`, one class per schema type (`StringSchemaEmitter`, `ObjectSchemaEmitter`, …), with only static methods named and parameterised like the schema method they compile, plus `_checkType` for the type check. Each method takes the checked value and the Issue path as expressions first and returns source text written in a `js` tagged template. The compiler dispatches a chained method to the emitter method of the same name, so adding a method to an emitter is what makes that method compile.

The emitters extend each other the way the schemas do. The base `Emitter` stands in for `Schema` and does the emitting: it dispatches each chained method, wraps each check in its `if`, and writes the Compiled Schema's class. `ChainableSchemaEmitter extends Emitter` adds `.optional()`/`.nullable()` and guards the rest of the checks behind them, and every schema's emitter extends it. A subclass overrides only the `_`-prefixed hooks: `_emitTypeCheck` and `_spellTypes` when its factory takes an argument (`pvl.literal('a')`), and `_emitBody` for a composite, which writes the body of `_checkType`. A name starting with `_` is never dispatched as a chained method. `compiledSchemaWriter.ts` (`CompiledSchemaWriter`) only picks the emitter of the Schema `pvl.compile()` wraps and reports what can't be compiled yet.

An emitted Issue's message comes from `@pvl/schema`'s `<SCHEMA>_SCHEMA_ISSUE_MESSAGE`, called at compile time and written as a literal. A message that names a runtime value (`.strict()`'s unknown key) is built at runtime around that message's literal text.

## Each Compiled Schema is a `Schema` subclass

Each `pvl.compile(...)` call becomes, in its mirrored module, a class `PvlCompiledSchema<n>` (counted in source order) placed after the module's imports, and the call becomes `new PvlCompiledSchema<n>()`. The class extends `@pvl/schema`'s `Schema`, imported under an alias so it can't clash with the module's own names, and its `_checkType` is the generated code. Its `Input` and `Output` type arguments are spelled out from the Schema, so it infers the types `pvl.compile()` does. [`schema/compile.md`](../schema/compile.md) holds the contract that class fills: empty modifier arrays, every `Issue` reported at the `path` it is handed, and a typed surface identical to what `pvl.compile()` returns before compilation, so the import swap is a drop-in at the type level too. It inherits `"~standard"` and reports `vendor: "@pvl/schema"` ([`standard-schema.md`](../standard-schema.md#conformance-rules)).

## Issues are literals, so the differential test is load-bearing

Each `Issue` ([ADR-0011](../../adr/0011-result-failure-branch-carries-pvl-issue.md)) is a plain object literal, importing nothing, with its code, message and path written out. Nothing but the differential test against the interpreted path keeps them right, which is why that test is load-bearing, not optional.
