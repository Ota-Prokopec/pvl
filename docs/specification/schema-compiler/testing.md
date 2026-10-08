# Testing `@pvl/schema-compiler`

The testing strategy for `@pvl/schema-compiler`, on top of the repo-wide rules in [`TESTS.md`](../../../TESTS.md). Read this before you write, change or review a test in `packages/schema-compiler/tests/`.

Tests exercise external behaviour only: what the compiler writes and reports, and how the emitted code behaves when imported. The internal AST walk, any intermediate representation and how a step is structured stay out of every assertion.

## Runner and layout

Vitest, with [`fast-check`](https://fast-check.dev) once there is emitted code to diff. Tests live in `packages/schema-compiler/tests/` as `*.test.ts`, one file per seam or concern. `tests/helpers.ts` builds fixture projects in a temporary directory (`createFixture`, removed after each test), links the workspace's built `@pvl/schema` into one so its Destination Directory can be imported and run (`linkSchemaPackage`), reads diagnostics back by code (`diagnosticCodes`), and asserts a failed run's errors with their `file`, plus that nothing was written (`expectFailure`).

## The two seams

1. **The programmatic entry point, `compile()`**, run against a fixture project. One seam, three assertion styles:
   - the returned diagnostics, asserted by **code** (never by message wording), plus `written` and the file on disk, since nothing may be written once an error fired;
   - an inline snapshot of each emitted mirrored module, written by hand as the expected output, to catch unintended churn in generated output;
   - importing an emitted mirrored module and diffing its `validate()` against the source module it mirrors, which shows the mirror runs as its source did;
   - once Schemas are compiled, a differential test: import the generated output and diff its `validate()` against the equivalent interpreted Schema under `fast-check`, comparing accepted values, Issue messages and Issue paths ([code-generation.md](./code-generation.md#issues-are-literals-so-the-differential-test-is-load-bearing)).

   Example: `tests/compile.test.ts`.

2. **The CLI, `runCli()`**, kept deliberately thin: argv to settings and their precedence, exit codes, the `--json` output shape, and `--strict` promoting warnings. It runs in process with captured `stdout`/`stderr`, and reads results back through `--json`. It doesn't re-test what seam 1 already covers. Example: `tests/cli.test.ts`.

The shipped JSON Schema for `pvlconfig.json` is pinned by an inline snapshot of `configJsonSchema()` (`tests/json-schema.test.ts`), so a change to the config's schema shows up as a reviewed diff of what editors see.

## Required cases

- **Every diagnostic code has a test at each seam that can raise it** (`INVALID_ARGUMENTS` only exists at the CLI): at seam 1 its code, severity and `file`; at seam 2 its exit code (`1` for an error, `0` for a warning) and that nothing was written. A new code adds a row to `ERROR_CASES` in `tests/cli.test.ts` and a case in `tests/compile.test.ts`.
- **Every warning is also run with `strict`**, which must turn it into an error that writes nothing.
- **Relative paths** are checked from both the config's directory and an ancestor (`--config apps/web/pvlconfig.json`), which must produce identical output.
