# The compiler's expected failures are BaseExceptions naming their diagnostic

**Every failure `@pvl/schema-compiler` throws in order to catch and recover from is a subclass of the abstract `BaseException` in `src/exceptions/`, constructed with its message, the `DiagnosticCode` it is reported as (`errorCode`, required) and the node it is thrown at (`offendingNode`, required). Its message describes only its own node; the code that catches it to report it adds where it is, as `readSchema` adds the line of the Schema it was reading and where `offendingNode` is, which may be in another file ([ADR-0043](./0043-the-compiler-follows-a-const-into-another-file-and-a-runtime-argument-there-is-an-error.md)). A bug in the compiler, a case that should never happen, throws a plain `new Error(…)`, which nothing catches.** There are four today: `UnresolvedNodeException` (COMPILE_ARGUMENT_UNRESOLVABLE), `ConstCycleException` (COMPILE_ARGUMENT_CYCLE), `UnknownPvlMethodException` (UNSUPPORTED_SCHEMA, [ADR-0038](./0038-pvl-ast-narrows-method-names-and-an-unknown-one-ends-the-reading.md)) and `ImportedRuntimeArgumentException` (RUNTIME_ARGUMENT_IN_IMPORTED_SCHEMA, ADR-0043). Lint allows `extends Error` only in `baseException.ts`.

Before, the two read failures were `UnresolvedNodeError` and `ConstCycleError` in `src/ast/`, each extending `Error` with a node of its own, and `readSchema` built the diagnostic for each in a branch of its own, choosing the code and writing the whole message there. A third failure meant a third branch in every reporter, and a reporter that missed one let it escape as a crash, which [ADR-0024](./0024-the-compiler-checks-syntax-not-types.md) rules out for any code that parses.

## Considered options

- **Keep extending `Error`, one branch per class.** Simple while there are two, but every reporter must know every class, and nothing on a class says which diagnostic it becomes. Rejected.
- **A code of the exceptions' own (`EXCEPTION_CODE`), mapped to a diagnostic code where it is caught.** It keeps exceptions apart from the public diagnostics, at the cost of a second set of codes and a mapping to keep in sync, when every exception so far is reported as exactly one diagnostic. Rejected.
- **An optional `errorCode`.** Every reporter reading it would have to handle none, and an exception with nothing to be reported as is a bug, which throws `Error`. Rejected.
- **Bugs as BaseExceptions too.** A BaseException says the failure is expected and recoverable. A bug is neither, and catching one would turn it into a diagnostic that blames the user's code. Rejected.

## Consequences

- A catch that reports reads `errorCode` and `message` off any BaseException (`readSchema`). A catch that recovers some other way still picks the class it handles: `readMethodArguments` turns an `UnresolvedNodeException` into a Runtime Argument, and `PvlAst.holdsSchema` reads any BaseException as "no Schema".
- A new expected failure is a new class in `src/exceptions/`, exported through its barrel, whose code says how it is reported. No reporter changes.
- `errorCode` is a public `DiagnosticCode`, so an exception can only be reported as a diagnostic that exists and is documented.
