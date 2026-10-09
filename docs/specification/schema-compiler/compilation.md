# Compilation

How `@pvl/schema-compiler` finds a schema marked with `pvl.compile(...)` and what it compiles. Read this before you work on discovery, or on which schema a marker compiles. [`schema/compile.md`](../schema/compile.md) defines `pvl.compile()` itself and the runtime shape a Compiled Schema must fill.

## Discovery: static AST analysis, not dynamic import

The compiler never runs or imports the user's schema code. It statically parses the TS/JS source of the files matched by `include` in the user's `pvlconfig.json`, using ts-morph, looking for `pvl.compile(...)` call expressions. See [ADR-0002](../../adr/0002-static-ast-compilation-via-ts-morph.md) for why (never executing user code; the trade-off is that only statically-resolvable schema expressions are compilable, and marking one that isn't is an error rather than a silent fallback).

## What reads statically

A call is recognised when `pvl` is imported from `@pvl/schema` under any name. Its argument may be a `pvl.*` call chain written in place, or a top-level `const` of the same file holding one, followed through any number of `const`s. A method's arguments may be literals (`3`, `-1`, `10n`, `'a'`, `{ message: 'too short' }`) or `const`s holding them. A plain `__proto__: …` in an object literal sets the prototype rather than adding a key, so it is no field, while `['__proto__']: …` is one. Anything else gets an error, and nothing is written. A call that can't be read, or whose result is modified, gets one; a call that reads but isn't a Compilable Schema gets one per problem, except that a non-composite argument is reported alone:

- `COMPILE_ARGUMENT_UNRESOLVABLE`: the argument, or a method argument, is imported, built by a function call, spread, or held in a `let`.
- `COMPILE_ARGUMENT_NOT_COMPOSITE`: the argument is a primitive, a literal or an enum, not an object or an array.
- `COMPILE_RESULT_MODIFIED`: something other than `.validate()` is read off the result (`pvl.compile(x).optional()`).
- `UNSUPPORTED_SCHEMA`: the Schema uses what isn't compiled yet. Today that is anything beyond a flat object or array of primitives, literals and enums with their Constraints and `.optional()`/`.nullable()`: a nested composite, a union, `.coerce()`, `.refine()`, `.transform()`, or a Modifier on the wrapped Schema itself.

## Compilation unit: exactly what `pvl.compile()` wraps

`pvl.compile()` is per-call-site: each call produces its own Compiled Schema for exactly the schema it wraps, whether that's a whole top-level schema (`pvl.compile(pvl.object({...}))`) or one nested field (`pvl.object({ key: pvl.compile(pvl.object({...})) })`). Compiling a nested field does **not** reach up and compile its containing schema — the parent stays an ordinary interpreted `Schema` regardless; if a fully-compiled top-level schema is wanted, wrap the top-level schema itself.

## Modifiers are baked in

Every Modifier is applied **before** compiling and baked into the emitted code, running in the same order and with the same short-circuit and collection rules as the interpreted path ([`schema/pipeline.md`](../schema/pipeline.md), [ADR-0010](../../adr/0010-modifiers-run-in-chain-order-around-the-type-check.md)). Only the _structural_ checks (type guards, required-field checks, array iteration, Constraints) become `Instruction`s. `.refine()` and `.transform()` bodies are arbitrary user code: they become calls to the user's own functions, imported by reference into the `Destination Directory`, and are never inlined or compiled.
