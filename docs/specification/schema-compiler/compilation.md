# Compilation

How `@pvl/schema-compiler` finds a schema marked with `pvl.compile(...)` and what it compiles. Read this before you work on discovery, or on which schema a marker compiles. [`schema/compile.md`](../schema/compile.md) defines `pvl.compile()` itself and the runtime shape a Compiled Schema must fill.

## Discovery: static AST analysis, not dynamic import

The compiler never runs or imports the user's schema code. It statically parses the TS/JS source of the files matched by `include` in the user's `pvlconfig.json`, using ts-morph, looking for `pvl.compile(...)` call expressions. See [ADR-0002](../../adr/0002-static-ast-compilation-via-ts-morph.md) for why (never executing user code; the trade-off is that only statically-resolvable schema expressions are compilable, and marking one that isn't is an error rather than a silent fallback).

## Compilation unit: exactly what `pvl.compile()` wraps

`pvl.compile()` is per-call-site: each call produces its own Compiled Schema for exactly the schema it wraps, whether that's a whole top-level schema (`pvl.compile(pvl.object({...}))`) or one nested field (`pvl.object({ key: pvl.compile(pvl.object({...})) })`). Compiling a nested field does **not** reach up and compile its containing schema — the parent stays an ordinary interpreted `Schema` regardless; if a fully-compiled top-level schema is wanted, wrap the top-level schema itself.

## Modifiers are baked in

Every Modifier is applied **before** compiling and baked into the emitted code, running in the same order and with the same short-circuit and collection rules as the interpreted path ([`schema/pipeline.md`](../schema/pipeline.md), [ADR-0010](../../adr/0010-modifiers-run-in-chain-order-around-the-type-check.md)). Only the _structural_ checks (type guards, required-field checks, array iteration, Constraints) become `Instruction`s. `.refine()` and `.transform()` bodies are arbitrary user code: they become calls to the user's own functions, imported by reference into the `Destination File`, and are never inlined or compiled.
