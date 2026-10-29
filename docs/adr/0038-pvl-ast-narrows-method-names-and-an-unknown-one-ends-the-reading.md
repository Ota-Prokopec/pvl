# PvlAst narrows method names, and an unknown one ends the reading

**`GenericAst` reads a method name as the `string` the source writes. `PvlAst` narrows it to the name `@pcvl/schema` gives it before handing it on: a call chain's factory to `PvlObjectPropertyName` (`pvl`'s factories and `compile`, in a `PvlFactoryCall`), and each method chained onto it to `PvlSchemaMethodName` (every Schema's methods, Modifiers, `validate` and `standalone` included, in a `SchemaCall`). A name `@pcvl/schema` doesn't have, `pvl.foo()` or `pvl.string().foo()`, throws `UnknownPvlMethodException` at that call, reported as `UNSUPPORTED_SCHEMA` ([ADR-0037](./0037-the-compilers-expected-failures-are-base-exceptions-naming-their-diagnostic.md)). It ends the reading of the Schema, so only the first is reported. A chained method's receiver is read before its name is checked, so `z.string().foo()` is reported at `z`.**

Before, every name passed through as a `string`. `.foo()` reached `Schema.findUncompilableDiagnostics`, whose Emitter tables have no method for it, and was one UNSUPPORTED_SCHEMA among the Schema's others, while `pvl.foo()` failed `readSchema`'s factory check and was COMPILE_ARGUMENT_UNRESOLVABLE. Every consumer compared names untyped, so a misspelt one (`methodName === 'standlone'`) compiled.

## Considered options

- **Pass every name through as a `string`, narrowing where it is used.** The diagnostics stay as they were, but every consumer of a call chain narrows again or compares untyped. Rejected.
- **Throw `UnresolvedNodeException` for an unknown name.** No new class, but `pvl.string().foo()` would be COMPILE_ARGUMENT_UNRESOLVABLE, its message saying it "isn't a pvl Schema, a literal or a const", where the source calls a method that doesn't exist. Rejected.
- **Narrow chained names to `PvlSchemaModifierMethodName` only,** taking `.validate()` and `.standalone()` off the chain into fields of their own. A larger reshaping of `readSchema` and `Module.holdsSchema`, for a narrower type. Rejected.
- **Narrow to the methods of the factory's own Schema,** so `pvl.string().strict()` fails to read. It would track a type along the chain, which the Emitters' method tables already decide. Rejected: such a call reads, and is UNSUPPORTED_SCHEMA as before.

## Consequences

- A Schema calling a method `@pcvl/schema` doesn't have reports that one error, not one per problem: a union or a spread argument elsewhere in it shows up once the call is fixed. The application's own type check already reports the unknown method ([ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)).
- `pvl.foo()` is UNSUPPORTED_SCHEMA, no longer COMPILE_ARGUMENT_UNRESOLVABLE.
- An `export const` whose chain calls an unknown method is no Schema to `Module.holdsSchema`, so it gets no Type Aliases ([ADR-0036](./0036-type-aliases-read-the-mirrored-binding-through-typeof.md)).
- The names are checked against `@pcvl/schema`'s own enums (`PVL_OBJECT_PROPERTY_NAMES_ENUM`, `PVL_SCHEMA_METHOD_NAME_ENUM`), whose types force them to list every method, so a method added to `@pcvl/schema` reads with no change here. Compiling it still needs its Emitter method.

> Superseded in part by [ADR-0046](./0046-a-mirrored-module-exports-exactly-what-its-source-exports.md): the Type Aliases and `Module.holdsSchema` are removed, so no `export const` gets Type Aliases.
