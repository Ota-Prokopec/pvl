# Static reading never evaluates an assignment

The compiler reads a Schema's arguments by evaluating literal expressions itself (`-1`, `!0`, `+'2'`, `!!!x`), and it will never evaluate an operator that assigns: `++`, `--`, `=` or a compound assignment such as `+=`. They are reported as `COMPILE_ARGUMENT_UNRESOLVABLE`, like a function call. An assignment's value is the variable's state at the moment the line runs, and the compiler never runs the code ([ADR-0002](./0002-static-ast-compilation-via-ts-morph.md)), so it has no state to read. Nor can there be one to look up in source: an assignment needs a variable that changes, and only top-level `const`s are followed, while `++LIMIT` on a `const` is a TypeError at runtime (and an error in TypeScript, which the compiler doesn't check, [ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)). Evaluating the expression once at compile time would also drop its side effect: the interpreted Schema increments the variable when the module loads, the Compiled Schema wouldn't, so the two would disagree on every later use of it.

## Considered options

- **Read `++x` as `x + 1` when `x` is a `const`.** Rejected: the line throws at runtime, so the Compiled Schema would accept a module the interpreted path can't even load.
- **Follow `let`s and replay their assignments.** Rejected: that is running the module, a data-flow analysis across every statement that can reach the variable, which static reading exists to avoid.

> Amended by [ADR-0030](./0030-a-method-argument-the-compiler-cant-read-is-a-runtime-argument-evaluated-once-where-it-is-written.md): an assignment such as `++count` as a method's argument is now a Runtime Argument, which the Compiled Schema evaluates once at runtime, side effect included; the compiler itself still never evaluates one.
