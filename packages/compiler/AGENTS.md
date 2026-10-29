# `@pcvl/compiler`

The ahead-of-time compiler for `@pcvl/schema`. Turns a `Schema` marked with `pvl.compile(...)` into a `Compiled Schema`: a [Standard Schema](../../docs/specification/standard-schema.md)-conformant object whose `validate` runs emitted `Instruction`s instead of walking the schema tree at runtime. Built so far: `pvlconfig.json` and the `pvl compile` CLI, which resolve settings and report diagnostics; the mirror, which writes every scanned file into the Destination Directory; compiling primitive, literal, enum, object and array Schemas, nested ones inlined, from another file too, with every Modifier baked in and each Standalone Key exposed through a compiled `shape`. Unions come next. See [`MONOREPO.md`](../../MONOREPO.md) for how it relates to `@pcvl/schema`, and [`GLOSSARY.md`](../../GLOSSARY.md) for the domain glossary (`AOT Compilation`, `Compiled Schema`, `Instruction`, `Destination Directory`, `Root Directory`).

Each section below says when it applies and which file to read. Read only the sections the current task needs.

## Technology

- TypeScript, ESM source. Depends on `@pcvl/schema` (for validating its own configuration, and for the Issue codes and default messages its Emitters reuse), [ts-morph](https://github.com/dsherret/ts-morph) for AST work (see the `ts-morph-analyzer` skill), and yargs and [`@clack/prompts`](https://bomb.sh/docs/clack/packages/prompts/) for the CLI and its progress UI.
- Built and published with tsup (see the `tsup` skill), emitting **both** ESM and CJS output — see [ADR-0004](../../docs/adr/0004-dual-esm-cjs-publish-via-tsup.md). The same build copies the hand-written `src/config/json-schema.json` to `dist/json-schema.json` (`tsup.config.ts`); it can drift from `pvlConfigFilePayloadSchema`, so change both together. The same build emits the declarations with the private `@repo/types` inlined, as in `@pcvl/schema` ([ADR-0048](../../docs/adr/0048-tsup-bundles-the-declarations-and-inlines-the-private-repo-types.md)).
- The `pvl` bin is `dist/bin.js`. Run the local build against a project with `node packages/compiler/dist/bin.js compile` from that project's directory, after `pnpm build`.

## Implementation rules

- **Every emit template lives in this package**, in an Emitter whose methods, held in its method tables, mirror the schema class's methods ([code-generation.md](../../docs/specification/compiler/code-generation.md#emitters-mirror-pvlschemas-methods)). A validation rule is split on purpose: its runtime half (`code`, `test`, and the default message in the schema file's `<SCHEMA>_SCHEMA_ISSUE_MESSAGE`, which the Emitter reuses) sits in `@pcvl/schema`, its codegen half (the source text emitted into the `Destination Directory`) sits here. Reuse anything else `@pcvl/schema` exports rather than re-implementing it. Emit strings are never executed at runtime, and class members can't be tree-shaken, so placing them in `@pcvl/schema` would ship dead weight in every consumer's bundle. The cost is that each constraint is written twice and the halves can drift, which the differential test catches.
- Generated output is a build artifact: keep the templates/codegen that produce it easy to diff and reason about, since it's the thing users will actually read when debugging a `Compiled Schema`.

## `pvl.compile()`

Read [`compile.md`](../../docs/specification/schema/compile.md) before you work on anything a Compiled Schema must satisfy. It is `@pcvl/schema`'s side of the contract: what `pvl.compile()` returns, and the `Schema` type a Compiled Schema implements.

## Compilation

Read [`compilation.md`](../../docs/specification/compiler/compilation.md) before you work on discovery or on which schema a marker compiles. It covers static AST discovery, the per-call-site compilation unit, and how Modifiers are baked in.

## Destination Directory

Read [`destination-directory.md`](../../docs/specification/compiler/destination-directory.md) before you change the compiler's output, its layout, or where it lands.

## Code generation

Read [`code-generation.md`](../../docs/specification/compiler/code-generation.md) before you write or change an emit template.

## Configuration and CLI

Read [`configuration-and-cli.md`](../../docs/specification/compiler/configuration-and-cli.md) before you change `pvlconfig.json`, a CLI flag, or a diagnostic.

## Tests

Read [`testing.md`](../../docs/specification/compiler/testing.md) before you write, change or review a test. It builds on the root [`TESTS.md`](../../TESTS.md) and defines the compiler's two seams, `runCompilation()` and the CLI.
