# Architecture

`pvl` is a pnpm/Turborepo monorepo (`apps/*`, `packages/*`, wired up via `pnpm-workspace.yaml` and `turbo.json`). See [CONTEXT.md](./CONTEXT.md) for the domain glossary and [AGENTS.md](./AGENTS.md) for root commands and working conventions.

## Project shape

Two packages define the project. Both exist as directories with their own `AGENTS.md`; neither has any implementation yet. Per the Core Rules in `AGENTS.md`, all technology/architecture/coding-style detail for a package lives in _that package's own_ `AGENTS.md`, not duplicated here — this file covers only the cross-package shape.

```
packages/
├── schema/            (npm: @pvl/schema) — Zod-style schema/validation library
│   └── AGENTS.md       → full detail: schema surface, Refinement/Transform/Coercion, Standard Schema conformance, validate(), pvl.compile()
└── schema-compiler/   (npm: @pvl/schema-compiler) — the ahead-of-time compiler
    └── AGENTS.md       → full detail: static AST discovery, compilation unit, generated-file output, Standard Schema conformance
```

`schema-compiler` depends on `schema` (compiles schemas defined with it into `Compiled Validator`s) and never the other way around. Both publish dual ESM+CJS builds via tsup, per [ADR-0004](./docs/adr/0004-dual-esm-cjs-publish-via-tsup.md). Both implement [Standard Schema](./docs/specification/standard-schema.md) — `schema` per [ADR-0001](./docs/adr/0001-adopt-standard-schema.md), `schema-compiler`'s output per [ADR-0003](./docs/adr/0003-compiled-validators-conform-to-standard-schema.md) — and `schema-compiler` discovers what to compile via static AST analysis rather than running user code, per [ADR-0002](./docs/adr/0002-static-ast-compilation-via-ts-morph.md).

`pvl.compile(X)` (`X` a composite schema — `object`/`array`, never a bare primitive) produces its own standalone `Compiled Validator`, scoped to exactly `X` — it never reaches up to compile an ancestor schema `X` is nested inside. Whether that compiled version requires a manual import-path change depends on `pvlconfig.json`'s `production` flag: in dev (`production: false`, default) it's a separate generated file the consumer opts into explicitly; in production (`production: true`, meant for CI/build), the compiler also rewrites `pvl.compile(...)` call sites to reference the compiled output, but only in the app's **build output**, never in its tracked source — see [ADR-0005](./docs/adr/0005-production-mode-gates-build-output-rewrite.md).

**Still open**:

- `pvlconfig.json`'s full shape beyond `production` and the directories to scan (output directory for generated files, other settings).

## Pre-existing scaffolding

The default `create-turbo` starter apps, `apps/web` and `apps/docs`, have been removed — they predated this project's purpose and were never part of the `@pvl/schema`/`@pvl/schema-compiler` architecture. `apps/` is kept as an empty placeholder directory for a future app.

Of the default `create-turbo` packages, `packages/eslint-config` and `packages/typescript-config` remain as generic shared tooling config, reusable by `@pvl/schema`/`@pvl/schema-compiler`. `packages/ui` — a starter shared React component package — also remains, but with no current consumer now that `apps/web`/`apps/docs` are gone; it's kept intentionally for a future app. None of the three currently have `AGENTS.md` files, which is a gap against the Core Rule that every `apps/*`/`packages/*` entry has one — that still needs closing before treating any of them as real project code.

## Decision history

Architectural decisions are recorded as ADRs in [`docs/adr/`](./docs/adr/):

- [ADR-0001](./docs/adr/0001-adopt-standard-schema.md) — adopt Standard Schema for `@pvl/schema`
- [ADR-0002](./docs/adr/0002-static-ast-compilation-via-ts-morph.md) — compile schemas via static AST analysis, not runtime introspection
- [ADR-0003](./docs/adr/0003-compiled-validators-conform-to-standard-schema.md) — compiled validators conform to StandardSchemaV1
- [ADR-0004](./docs/adr/0004-dual-esm-cjs-publish-via-tsup.md) — publish `@pvl/schema` and `@pvl/schema-compiler` as dual ESM+CJS
- [ADR-0005](./docs/adr/0005-production-mode-gates-build-output-rewrite.md) — production-mode compilation rewrites build output, never tracked source
