# `@repo/types`

A minimal internal package with a single purpose: exporting `ValueOfEnum<T>`, the utility type [`docs/standards/typescript.md`](../../docs/standards/typescript.md) mandates every `as const` enum consumer in this monorepo import, instead of re-declaring a copy or inlining `typeof X[keyof typeof X]`.

```ts
export type ValueOfEnum<T> = T[keyof T];
```

That standards file's "Use ValueOfEnum for extracting enum value types" section holds the consuming-package usage example.

## Technology

- TypeScript, ESM source (see root `AGENTS.md` Core Rules). Types only — no runtime dependencies.
- Takes the shared `@repo/eslint-config` and `@repo/typescript-config` as `workspace:*` devDependencies rather than standalone config, like every other package here.

## Architecture

This package stays intentionally narrow: it exists because `docs/standards/typescript.md` mandated `ValueOfEnum` as a shared import before any package existed to provide it. It is not a general-purpose utilities dump — a new cross-package type utility belongs here only if it serves the same role (a single canonical implementation of something the repo's standards already require every consumer to share), never merely because somewhere central is convenient.

[`@pvl/schema`](../schema/AGENTS.md) takes it as a `workspace:*` dependency for its own internal `as const` enums (e.g. `Issue` codes).

## Coding style / best practices

- Follow [`docs/standards/typescript.md`](../../docs/standards/typescript.md) for all TypeScript conventions.
