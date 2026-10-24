# `benchmark`

A private app that measures the code [`@pvl/schema-compiler`](../../packages/schema-compiler/AGENTS.md) emits against hand-split alternatives. It is the evidence behind [ADR-0023](../../docs/adr/0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md), and its findings, with the V8 limits that explain them, are written up in [`docs/research/v8-inlining-and-optimization-limits.md`](../../docs/research/v8-inlining-and-optimization-limits.md).

It compares three variants of the same Schemas:

- **V1, inline everything**: `src/schemas/benchmark.ts` holds the Schemas marked with `pvl.compile(...)`, and `pvl compile` mirrors them into `.pvl/` (git-ignored). Each compiles to one `_validate` holding its whole tree.
- **V2, a function per nested object or array** (`src/variants/perComposite.ts`).
- **V3, a function per key** (`src/variants/perKey.ts`).

## Build first

Every command needs `@pvl/schema` and `@pvl/schema-compiler` built (`pnpm build` at the root), since the `pvl` bin is `packages/schema-compiler/dist/bin.js`.

## Commands

- `pnpm --filter benchmark bench`: the quick run, about two minutes. It checks the variants agree, then prints module size, cold start and hot time and heap per call. The hot numbers come from one process, so they are noisy.
- `pnpm --filter benchmark bench:isolated`: the reliable hot time. Every Schema × input × variant runs in a fresh process, for 10 shuffled rounds by default (several minutes). Narrow it with `-- --rounds 3 --schemas list,huge`.

## Rules

- **V2 and V3 are hand-derived from V1's emitted code, and differ from it only in the split.** Same checks, same Issues, paths built only where V1 builds them. A child pushes into its parent's `issues` and returns its output. When a Schema in `src/schemas/benchmark.ts` changes, re-derive both, and keep `src/inputs.ts` covering it with one valid and one invalid input.
- **The variants must agree before anything is measured.** `bench` asserts every variant returns the same Result for every input. Never weaken that check to get a number.
- **No tests, by decision**, as in [`apps/playground`](../playground/AGENTS.md): the agreement check is the only assertion, and the output is measurements.
