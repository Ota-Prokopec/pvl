# The compiler checks syntax, not types

`@pcvl/compiler` reports a scanned file that doesn't parse (`PARSE_FAILED`) and nothing more: it never runs TypeScript's type checker over the application, though ts-morph could (`getPreEmitDiagnostics()`, with nothing emitted). The compiler only writes TypeScript into the Destination Directory, and the application's own type check (`tsc`, the editor, the framework's check step) reads the same source and its mirror, under the application's real tsconfig, so every type error is still reported once, by the tool that owns it. Type-checking here would cost a whole-program check, `node_modules` declarations included, on every run, and would judge the code under the compiler's own resolution settings (`TsMorphProject`'s bundler options) rather than the application's, so it could report errors the application doesn't have and miss ones it does.

## Consequences

The compiler reads code that parses but doesn't type-check, so every static read must end in a Diagnostic, never a crash. A `const` that reaches itself, `const user = pvl.object({ friend: user })`, is a type error (TS2448) the compiler never sees; reading it would recurse without end, so it is reported as `COMPILE_ARGUMENT_CYCLE` instead.

Binding a name is not type-checking. To follow a `const`, the compiler asks ts-morph which declaration an identifier names in its scope (`getSymbol()`), so a parameter or a local that shadows a top-level `const` isn't read as it. That builds a Program to bind names in, and checks no type.
