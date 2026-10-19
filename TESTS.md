# Testing

The testing rules every workspace entry follows. Read this before you write, change or review a test. Each package with its own testing strategy layers it on top of these rules:

- [`docs/specification/schema/testing.md`](./docs/specification/schema/testing.md): the `@pvl/schema` strategy (the four seams, the required pipeline cases, property-based tests).
- [`docs/specification/schema-compiler/testing.md`](./docs/specification/schema-compiler/testing.md): the `@pvl/schema-compiler` strategy (the two seams, a test per diagnostic at each).

## Rules

- **Tests cover every error and warning path**, not only the happy path. Enumerate every diagnostic a component (CLI included) can produce and write a case per diagnostic.
- **Compare against a reference implementation where one exists**, rather than asserting the output is non-empty. For the compiler, that reference is the interpreted `@pvl/schema` path.
