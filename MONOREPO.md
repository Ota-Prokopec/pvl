# Monorepo

The inventory of this pnpm + Turborepo workspace: every entry under `apps/*`, `packages/*` and `scripts/*`, and how they depend on each other. Each entry's own `AGENTS.md` holds its technology, architecture, rules and commands, so how a package _behaves_ belongs there or in [`docs/specification/`](./docs/specification/), never here.

```
apps/
├── docs/              (docs, private)       — documentation site for @pvl/schema
└── playground/        (playground, private) — scratch app for watching @pvl/schema work
packages/
├── schema/            (npm: @pvl/schema)          — Zod-style schema/validation library
├── schema-compiler/   (npm: @pvl/schema-compiler) — the ahead-of-time compiler (not implemented yet)
├── types/             (@repo/types)               — the shared ValueOfEnum utility type
├── git-worktrees/     (@repo/git-worktrees)       — the git worktree reader the scripts share
├── conventions/       (@repo/conventions)         — the repo's conventions as ESLint rules and git hooks
├── eslint-config/     (@repo/eslint-config)       — shared ESLint presets
└── typescript-config/ (@repo/typescript-config)   — shared tsconfig bases
scripts/
├── claude/            (claude, private)      — `pnpm claude`: start Claude Code in a picked git worktree
└── claude-list/       (claude-list, private) — `pnpm claude-list`: remove picked git worktrees and their branches
```

Every entry's `AGENTS.md` sits in its folder.

## Dependencies

- `@pvl/schema-compiler` depends on `@pvl/schema`, never the other way round. Those two publish to npm; everything else is private.
- `@pvl/schema` depends on `@repo/types` for its internal enums.
- Both scripts read worktrees through `@repo/git-worktrees`. Nothing depends on the scripts or the apps.
- `@repo/eslint-config` and `@repo/typescript-config` are real, adopted dependencies, not create-turbo leftovers: every entry takes them as `workspace:*` devDependencies. `@repo/eslint-config` wires in `@repo/conventions`.

## Scripts

`scripts/` holds only folders. Each script is its own workspace package `scripts/<name>/` with its own `package.json`, `tsconfig.json`, `eslint.config.ts` and `AGENTS.md`, started from the root by a `"<name>": "node scripts/<name>/src/index.ts"` script in the root `package.json`. [`scripts/claude/AGENTS.md`](./scripts/claude/AGENTS.md) explains how they run.

## Wiring

`pnpm-workspace.yaml` declares the globs (`apps/*`, `packages/*`, `scripts/*`) and `turbo.json` the task graph; both are the source of truth for which entries exist and how their tasks chain.
