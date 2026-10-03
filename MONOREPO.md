# Monorepo

What lives in this pnpm + Turborepo workspace and why. Each entry's own `AGENTS.md` owns its technology, architecture and coding style; [`AGENTS.md`](./AGENTS.md) at the root owns the repo-wide conventions and [`CONTEXT.md`](./CONTEXT.md) the domain glossary.

This file is an **inventory**: the entries under `apps/*`, `packages/*` and `scripts/*`, a brief purpose for each, the dependency direction between them, and the workspace wiring. How a single package _behaves_ (e.g. `pvl.compile()` semantics, `Destination File` rules, `pvlconfig.json` contents) belongs in that package's own `AGENTS.md`. When such material turns up here, move it there, carrying over only what the package doc lacks.

```
apps/
├── docs/              (docs, private)       — documentation site for @pvl/schema
├── playground/        (playground, private) — scratch app for watching @pvl/schema work
└── web/                                     — untouched create-turbo starter
packages/
├── schema/            (npm: @pvl/schema)          — Zod-style schema/validation library
├── schema-compiler/   (npm: @pvl/schema-compiler) — the ahead-of-time compiler
├── types/             (@repo/types)               — the shared ValueOfEnum utility type (enum objects and literal arrays)
├── eslint-config/     (@repo/eslint-config)       — shared ESLint presets
├── typescript-config/ (@repo/typescript-config)   — shared tsconfig bases
└── ui/                                            — untouched create-turbo starter
scripts/
└── claude/            (claude, private)     — `pnpm claude`: start Claude Code in a picked git worktree
```

## The two project packages

- [**`packages/schema`**](./packages/schema/AGENTS.md) is the library: compose `Schema`s and validate values against them at runtime. Implemented.
- [**`packages/schema-compiler`**](./packages/schema-compiler/AGENTS.md) is the ahead-of-time compiler: it turns a `Schema` marked with `pvl.compile(...)` into a `Compiled Schema` that validates by running emitted code instead of walking the schema tree. Not implemented yet.

`schema-compiler` depends on `schema` and never the other way around. Both publish to npm; everything else here is private.

## Supporting entries

- [**`apps/docs`**](./apps/docs/AGENTS.md) — the user-facing documentation site for `@pvl/schema`: hand-written VitePress guide pages plus an API reference generated from the library's source by TypeDoc. Deployment is not set up.
- [**`apps/playground`**](./apps/playground/AGENTS.md) — a committed scratch app that composes Schemas, validates a passing and a failing value against each, and prints the `Result`s, so the library can be watched working without writing a throwaway test.
- **`scripts/*`** — private developer scripts. `scripts/` holds only folders: each script is its own workspace package `scripts/<name>/` (package name `<name>`) with its own `package.json`, `tsconfig.json`, `eslint.config.mjs` and `AGENTS.md`, started from the repo root by a root `package.json` script `"<name>": "node scripts/<name>/src/index.ts"`. Node runs the TypeScript directly, so there is no build step. Nothing depends on them. The first is [**`scripts/claude`**](./scripts/claude/AGENTS.md) (`pnpm claude`), which picks a git worktree (or creates one) from a menu and starts Claude Code there with `--dangerously-skip-permissions`.
- [**`packages/types`**](./packages/types/AGENTS.md) — supplies the `ValueOfEnum<T>` utility type [`docs/standards/typescript.md`](./docs/standards/typescript.md) mandates every `as const` enum consumer import rather than re-declare; it reads the values of an `as const` object and the elements of a literal array alike, the latter for `pvl.enum(['A', 'B'])`. `@pvl/schema` depends on it for its own internal enums.
- **`packages/eslint-config`** and **`packages/typescript-config`** are **real, adopted dependencies**, not create-turbo leftovers: `@pvl/schema`, `@repo/types`, both apps and `scripts/claude` take them as `workspace:*` devDependencies instead of standing up bespoke config. Treat them as part of the architecture.
- **`apps/web`** (starter Next.js app) and **`packages/ui`** (starter React component package) are untouched `create-turbo` scaffolding with no consumer and no `AGENTS.md` — a known gap against the Core Rule that every `apps/*`/`packages/*` entry has one. Decide whether to repurpose, document or remove them before treating either as project code (see GitHub issue #1, closed without being executed).

## Wiring

`pnpm-workspace.yaml` declares the globs (`apps/*`, `packages/*`, `scripts/*`) and `turbo.json` the task graph; both are the source of truth for which entries exist and how their tasks chain.
