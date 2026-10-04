# Testing

The testing rules every workspace entry follows. Read this before you write, change or review a test. Each package with its own testing strategy layers it on top of these rules:

- [`packages/schema/TESTS.md`](./packages/schema/TESTS.md): the `@pvl/schema` strategy (runner, file placement, property-based tests).
- `packages/schema-compiler/TESTS.md`: the `@pvl/schema-compiler` strategy, once the package has one.

## Rules

- **Tests cover every error and warning path**, not only the happy path. Enumerate every diagnostic a component (CLI included) can produce and write a case per diagnostic.
- **Compare against a reference implementation where one exists**, rather than asserting the output is non-empty. For the compiler, that reference is the interpreted `@pvl/schema` path.
