# `@pvl/schema-compiler`

The ahead-of-time compiler for `@pvl/schema`. Turns a `Schema` marked with `pvl.compile(...)` into a `Compiled Schema`: a [Standard Schema](../../docs/specification/standard-schema.md)-conformant object whose `validate` runs emitted `Instruction`s instead of walking the schema tree at runtime. Built so far: `pvlconfig.json` and the `pvl compile` CLI, which resolve settings and report diagnostics; the mirror, which writes every scanned file into the Destination Directory; and compiling flat object and array Schemas. Nested composites and Modifiers on the compiled Schema come next. See [`MONOREPO.md`](../../MONOREPO.md) for how it relates to `@pvl/schema`, and [`GLOSSARY.md`](../../GLOSSARY.md) for the domain glossary (`AOT Compilation`, `Compiled Schema`, `Instruction`, `Destination Directory`, `Root Directory`).

Each section below says when it applies and which file to read. Read only the sections the current task needs.

## Technology

- TypeScript, ESM source. Depends on `@pvl/schema` (for validating its own configuration), [ts-morph](https://github.com/dsherret/ts-morph) for AST work (see the `ts-morph-analyzer` skill), and yargs for the CLI.
- Built and published with tsup (see the `tsup` skill), emitting **both** ESM and CJS output — see [ADR-0004](../../docs/adr/0004-dual-esm-cjs-publish-via-tsup.md). The same build writes `dist/json-schema.json` from `configSchema` (`tsup.config.ts`), and declarations come from `tsc --project tsconfig.build.json`, as in `@pvl/schema`.
- The `pvl` bin is `dist/bin.js`. Run the local build against a project with `node packages/schema-compiler/dist/bin.js compile` from that project's directory, after `pnpm build`.

## Implementation rules

- **Every emit template lives in this package**, in an Emitter whose static methods mirror the schema class's methods ([code-generation.md](../../docs/specification/schema-compiler/code-generation.md#emitters-mirror-pvlschemas-methods)). A validation rule is split on purpose: its runtime half (`code`, `test`, and the default message in the schema file's `<SCHEMA>_SCHEMA_ISSUE_MESSAGE`, which the Emitter reuses) sits in `@pvl/schema`, its codegen half (the source text emitted into the `Destination Directory`) sits here. Reuse anything else `@pvl/schema` exports rather than re-implementing it. Emit strings are never executed at runtime, and class members can't be tree-shaken, so placing them in `@pvl/schema` would ship dead weight in every consumer's bundle. The cost is that each constraint is written twice and the halves can drift, which the differential test catches.
- Generated output is a build artifact: keep the templates/codegen that produce it easy to diff and reason about, since it's the thing users will actually read when debugging a `Compiled Schema`.

## `pvl.compile()`

Read [`compile.md`](../../docs/specification/schema/compile.md) before you work on anything a Compiled Schema must satisfy. It is `@pvl/schema`'s side of the contract: what `pvl.compile()` returns, and the `_checkType` hook a Compiled Schema fills.

## Compilation

Read [`compilation.md`](../../docs/specification/schema-compiler/compilation.md) before you work on discovery or on which schema a marker compiles. It covers static AST discovery, the per-call-site compilation unit, and how Modifiers are baked in.

## Destination Directory

Read [`destination-directory.md`](../../docs/specification/schema-compiler/destination-directory.md) before you change the compiler's output, its layout, or where it lands.

## Code generation

Read [`code-generation.md`](../../docs/specification/schema-compiler/code-generation.md) before you write or change an emit template.

## Configuration and CLI

Read [`configuration-and-cli.md`](../../docs/specification/schema-compiler/configuration-and-cli.md) before you change `pvlconfig.json`, a CLI flag, or a diagnostic.

## Tests

Read [`testing.md`](../../docs/specification/schema-compiler/testing.md) before you write, change or review a test. It builds on the root [`TESTS.md`](../../TESTS.md) and defines the compiler's two seams, `compile()` and the CLI.
