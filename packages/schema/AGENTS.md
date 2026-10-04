# `@pvl/schema`

A Zod-style schema validation library: compose `Schema`s and validate values against them at runtime. See [`@pvl/schema-compiler`'s `AGENTS.md`](../schema-compiler/AGENTS.md) for what the compiler does with a schema defined here, and [`CONTEXT.md`](../../CONTEXT.md) for the domain glossary (`Schema`, `Modifier`, `Constraint`, `Issue`, `Result`, `Refinement`, `Transform`, `Coercion`, `Chainable Schema`, `Compiled Schema`) used throughout.

Each section below says when it applies and which file to read. Read only the sections the current task needs.

## Technology

- TypeScript, ESM source. The only runtime dependency is `@standard-schema/spec` — the canonical `StandardSchemaV1` type definitions, types-only and zero executable code.
- Built and published with tsup (see the `tsup` skill), emitting **both** ESM and CJS — [ADR-0004](../../docs/adr/0004-dual-esm-cjs-publish-via-tsup.md). The dual output is a publish-target concern only; source stays ESM.
- Takes the monorepo's shared `@repo/eslint-config` (its `base` preset, plus TSDoc and no-regex rules of its own in `eslint.config.ts`) and `@repo/typescript-config` (`base.json`) as `workspace:*` devDependencies rather than standalone config, plus [`@repo/types`](../types/AGENTS.md) as a dependency for its own internal `as const` enums (e.g. `Issue` codes).

## Entry point: the `pvl` namespace

The single public entry point is a `pvl` namespace object (`import { pvl } from '@pvl/schema'`), not a set of flat named exports. Every factory hangs off it: `pvl.string()`, `pvl.number()`, `pvl.boolean()`, `pvl.bigint()`, `pvl.object(shape)`, `pvl.array(item)`, `pvl.union(schemas)`, `pvl.literal(value)`, `pvl.enum(source)`, `pvl.compile(schema)`.

## Implementation rules

- **Primitive validators must be written for raw speed**: no comparatively slow techniques. They are both the runtime hot path for every schema built on them and the performance baseline `@pvl/schema-compiler`'s output is trying to beat. This is also why regex-backed helpers stay out of the built-in surface.
- **This package carries runtime behaviour only.** A constraint's `code`, default `message` and `test` live here; the JavaScript source text the compiler emits for it lives in `@pvl/schema-compiler` (see its `AGENTS.md`).

## Modifiers

Read [`docs/pipeline.md`](./docs/pipeline.md) before you add or change a Modifier, or touch `Schema` or `ChainableSchema`. It covers the two base classes, the chained API, the pre/post Modifier pipeline, custom messages, and Refinement, Coercion and Transform.

## Schema types

Read [`docs/schema-types.md`](./docs/schema-types.md) before you add a schema type or a constraint, or change how one behaves. It holds the v1 surface and each type's accepted values.

## Public contract

Read [`docs/public-contract.md`](./docs/public-contract.md) before you touch `validate()`, `"~standard"`, `Result` or `Issue`. It covers Standard Schema conformance and why `validate()` is synchronous only.

## Compiler-facing surface

Read [`docs/compile.md`](./docs/compile.md) before you touch `pvl.compile()`, `_checkType`, or how a composite calls its children.

## TSDoc

Read [`docs/tsdoc.md`](./docs/tsdoc.md) before you write a doc comment or export something new.

## Tests

Read [`TESTS.md`](./TESTS.md) before you write, change or review a test.
