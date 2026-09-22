# `@repo/types`

A minimal internal package with a single purpose: exporting `ValueOfEnum<T>`, the utility type [`docs/standards/typescript.md`](../../docs/standards/typescript.md) mandates every `as const` enum consumer in this monorepo use to derive a value union, instead of each package re-declaring its own copy or inlining `typeof X[keyof typeof X]`.

```ts
export type ValueOfEnum<T> = T[keyof T]
```

See `docs/standards/typescript.md`'s "Use ValueOfEnum for extracting enum value types" section for the consuming-package usage example (an `as const` enum object plus the derived `ValueOfEnum<typeof ...>` value-union type) — not repeated here.

## Technology

- TypeScript, ESM source (see root `AGENTS.md` Core Rules). No runtime dependencies — this package is types only.
- Depends on the monorepo's shared `@repo/eslint-config` and `@repo/typescript-config` as `workspace:*` devDependencies, rather than a standalone lint/type-check config, consistent with every other package in this monorepo.

## Architecture

This package stays intentionally narrow: it exists because `docs/standards/typescript.md` already mandated `ValueOfEnum` as a shared import before any package that needed it actually existed to provide it. It is not a general-purpose types/utilities dumping ground — a new cross-package type utility only belongs here if it serves the same role `ValueOfEnum` does (a single canonical implementation of something the repo's own standards already require every consumer to share), not merely because it's convenient to put it somewhere central.

`@pvl/schema` takes this package as a `workspace:*` dependency for its own internal `as const` enums (e.g. `Issue` codes) — see [`packages/schema/AGENTS.md`](../schema/AGENTS.md).

## Coding style / best practices

- Follow [`docs/standards/typescript.md`](../../docs/standards/typescript.md) for all TypeScript conventions.

## Open questions

- None currently.
