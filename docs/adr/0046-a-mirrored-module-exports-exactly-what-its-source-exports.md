# A mirrored module exports exactly what its source exports

**A mirrored module exports exactly what its source exports. Development runs the Interpreted Schemas from the source and production runs the Compiled Schemas from the mirror, and an application swaps one for the other with an alias, so every name it imports has to exist on both sides.**

- Each exported Schema behaves as its source Schema does. Only its implementation differs.
- Exported functions, variables and types are the same as in the source, a type alias the source declares (`export type User = InferOutput<typeof userSchema>`) included.
- Nothing importable is added.
- The only differences allowed are the ones the compiled replacement needs:
  - each `pvl.compile(...)` replaced by its Compiled Schema's class expression, plus the type-only `@pvl/schema` import it needs;
  - Runtime Arguments hoisted into `const pvlArg<n>` ([ADR-0030](./0030-a-method-argument-the-compiler-cant-read-is-a-runtime-argument-evaluated-once-where-it-is-written.md));
  - module specifiers rewritten to resolve from the mirror's location;
  - the `@generated` header;
  - the bookkeeping files nothing imports, `.pvl-generated` and `.gitignore`.

## Consequences

- The `<Name>Input` and `<Name>Output` Type Aliases each mirrored module ended with are removed, with the type-only `InferInput`/`InferOutput` import they needed and the reading of exported Schemas only they used. Code importing one typechecked under the production alias and failed in development. This supersedes [ADR-0036](./0036-type-aliases-read-the-mirrored-binding-through-typeof.md).
- The `withTypes` setting is removed: `"withTypes"` in `pvlconfig.json` is an unknown key (`INVALID_CONFIG`), and `--with-types`/`--no-with-types` an unknown flag (`INVALID_ARGUMENTS`).
- The generated barrel, `<destination>/index.ts` re-exporting every mirrored module, is removed: an import of it had no counterpart in the source. A `<rootDir>/index.ts` the application wrote is mirrored like any other file. `DUPLICATE_EXPORT`, which existed only to keep the generated barrel unambiguous, goes with it, so two files exporting the same name are no longer rejected.
- `DEFAULT_EXPORT` becomes a warning. A default export is mirrored as written, a `pvl.compile(...)` in it compiled, so the rule holds, but a Schema should be exported under a name. `--strict` still makes it an error.
- A future feature that would add an importable name to the mirror is checked against this rule.
