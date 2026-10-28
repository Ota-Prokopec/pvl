# The precheck leaves grammar errors to the application's toolchain

**`PARSE_FAILED` reports only what TypeScript's parser rejects. A grammar error TypeScript's checker reports is left to the application's toolchain, as type errors are ([ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)).**

- `PARSE_FAILED` reads `getSyntacticDiagnostics` and names the file's first error only.
- TypeScript's checker reports some errors that JavaScript counts as syntax errors: a top-level `return` (TS1108), `const x;` (TS1155), a stray `break` (TS1105). The precheck doesn't report them, and the file is mirrored as written.
- The application's own toolchain (its bundler, `tsc`, the editor) reads the same source file and reports them there. A bundler may accept some of them, but `tsc` reports every one.
- Catching them would run the checker on every scanned file, costing about 5 ms per file on this repo's packages.
- Filtering the checker's output by code range isn't enough: TS1192 (a module with no default export) and TS1484 (`verbatimModuleSyntax`) sit in the same TS1xxx range and depend on the compiler's own settings.
- A `pvl.compile(...)` in such a file is still read, and every read still ends in a diagnostic, never a crash: a `const name;` read as an argument raises `COMPILE_ARGUMENT_UNRESOLVABLE`.
