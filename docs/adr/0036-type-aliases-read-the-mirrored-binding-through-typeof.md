# Type aliases read the mirrored binding through `typeof`

**Under `withTypes`, each Schema a mirrored module exports gets two exported type aliases at the end of that module, named after the export and typed from the mirror's own binding: `export type UserSchemaInput = PvlInferInput<typeof userSchema>;` and `export type UserSchemaOutput = PvlInferOutput<typeof userSchema>;`. They are not spelled out structurally (`{ name: string }`).** `@pvl/schema`'s `InferInput` and `InferOutput` come in through one type-only import, aliased as `COMPILED_SCHEMA_IMPORT` aliases its own. A Schema here is what the compiler can tell is one without a type checker: an `export const` whose value is a `pvl.*` call chain, read the way a `pvl.compile(...)` argument is, marked or not.

The spec asked for aliases "generated structurally rather than as a live type-only import back into the application's source", written when the output was one aggregate Destination File. That file couldn't name a Schema of the application without importing it back from the source. A mirrored module holds the Schema itself, so `typeof userSchema` names the binding next to it and imports nothing from the source. That was the point of the requirement, and it holds.

## Considered options

- **Spelled out by TypeScript's type checker.** ts-morph can expand `InferOutput<typeof userSchema>` and print the result. That needs the whole-program type check [ADR-0024](./0024-the-compiler-checks-syntax-not-types.md) rules out, under the compiler's resolution settings rather than the application's, on every run. A printed type can also name something that isn't in scope in the mirrored module, which would need an import of its own. Rejected.
- **Spelled out by the Emitters.** They already spell a Compiled Schema's `Input` and `Output` (`_spellTypes`), with no type checker. But a `.transform()`'s output is a type parameter inferred from the user's function at the call site, so there is nothing to spell, and only Compilable Schemas have Emitters, not a union or an unmarked Schema. Rejected: the transform case is exactly the one that needs both aliases.

## Consequences

- An alias is exactly what the mirrored binding infers. The differential test already pins a Compiled Schema's types to the interpreted ones, so the alias matches what the source Schema infers too.
- A Schema built by a function, imported, or exported only through `export { … }` gets no alias: without a type checker, the compiler can't tell it is a Schema, and an `export { … }` would need its local and exported names told apart.
- Generated names can clash: with each other, with a name the module declares or exports, or, through a barrel the application wrote, with another scanned file's export. The compiler doesn't check for it: each clash is a duplicate identifier or an ambiguous `export *`, which TypeScript reports wherever the mirror is typechecked, so a generated alias never silently shadows or is shadowed.
