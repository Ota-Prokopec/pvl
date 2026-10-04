# `@pvl/schema-compiler`

The ahead-of-time compiler for `@pvl/schema`. Turns a `Schema` marked with `pvl.compile(...)` into a `Compiled Schema`: a [Standard Schema](../../docs/specification/standard-schema.md)-conformant object whose `validate` runs emitted `Instruction`s instead of walking the schema tree at runtime. Implementation hasn't started: this directory holds only this file, which documents the conventions the package will be built under. See [`MONOREPO.md`](../../MONOREPO.md) for how it relates to `@pvl/schema`, and [`CONTEXT.md`](../../CONTEXT.md) for the domain glossary (`AOT Compilation`, `Compiled Schema`, `Instruction`, `Destination File`).

Each section below says when it applies and which file to read. Read only the sections the current task needs.

## Technology

- TypeScript, ESM source. Depends on `@pvl/schema` (for validating its own configuration), [ts-morph](https://github.com/dsherret/ts-morph) for AST work (see the `ts-morph-analyzer` skill), yargs for the CLI, and tsup for building the default destination.
- Built and published with tsup (see the `tsup` skill), emitting **both** ESM and CJS output — see [ADR-0004](../../docs/adr/0004-dual-esm-cjs-publish-via-tsup.md).

## Implementation rules

- **Every emit template lives in this package.** A validation rule is split on purpose: its runtime half (`code`, `message`, `test`) sits in the `@pvl/schema` class, its codegen half (the source text emitted into the `Destination File`) sits here. Emit strings are never executed at runtime, and class members can't be tree-shaken, so placing them in `@pvl/schema` would ship dead weight in every consumer's bundle. The cost is that each constraint is written twice and the halves can drift, which the differential test catches.
- Generated output is a build artifact: keep the templates/codegen that produce it easy to diff and reason about, since it's the thing users will actually read when debugging a `Compiled Schema`.

## `pvl.compile()`

Read [`compile.md`](../../docs/specification/schema/compile.md) before you work on anything a Compiled Schema must satisfy. It is `@pvl/schema`'s side of the contract: what `pvl.compile()` returns, and the `_checkType` hook a Compiled Schema fills.

## Compilation

Read [`compilation.md`](../../docs/specification/schema-compiler/compilation.md) before you work on discovery or on which schema a marker compiles. It covers static AST discovery, the per-call-site compilation unit, and how Modifiers are baked in.

## Destination File

Read [`destination-file.md`](../../docs/specification/schema-compiler/destination-file.md) before you change the compiler's output, its layout, or where it lands.

## Code generation

Read [`code-generation.md`](../../docs/specification/schema-compiler/code-generation.md) before you write or change an emit template.

## Configuration and CLI

Read [`configuration-and-cli.md`](../../docs/specification/schema-compiler/configuration-and-cli.md) before you change `pvlconfig.json`, a CLI flag, or a diagnostic.

## Tests

Read [`TESTS.md`](../../TESTS.md) before you write, change or review a test. The compiler's suite diffs compiled `validate()` against interpreted `validate()`, as [`code-generation.md`](../../docs/specification/schema-compiler/code-generation.md#issues-are-literals-so-the-differential-test-is-load-bearing) explains.
