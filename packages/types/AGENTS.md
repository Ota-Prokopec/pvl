# `@repo/types`

A minimal internal package with a single purpose: exporting `ValueOfEnum<T>`, the utility type [`docs/specification/enums-and-constants.md`](../../docs/specification/enums-and-constants.md) mandates every `as const` enum consumer in this monorepo import, instead of re-declaring a copy or inlining `typeof X[keyof typeof X]`.

```ts
export type ValueOfEnum<T> = T extends ReadonlyArray<unknown> ? T[number] : T[keyof T];
```

The array branch exists for `@pvl/schema`'s `pvl.enum(['A', 'B'])`, whose source is a readonly tuple of literals: `T[keyof T]` on an array would also yield `length` and every array method. `ReadonlyArray` rather than `any[]`, since a `const`-inferred tuple is readonly and `any[]` does not match it.

## Technology

- TypeScript, ESM source. Types only — no runtime dependencies.
- Takes the shared `@repo/eslint-config` and `@repo/typescript-config` as `workspace:*` devDependencies rather than standalone config, like every other package here.

## Architecture

This package stays intentionally narrow: it exists because the repo's enum convention mandated `ValueOfEnum` as a shared import before any package existed to provide it. It is not a general-purpose utilities dump — a new cross-package type utility belongs here only if it serves the same role (a single canonical implementation of something the repo's standards already require every consumer to share), never merely because somewhere central is convenient.

[`@pvl/schema`](../schema/AGENTS.md) takes it as a `workspace:*` dependency for its own internal `as const` enums (e.g. `Issue` codes).
