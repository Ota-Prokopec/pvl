# `@repo/git-worktrees`

The shared git worktree reader for the developer scripts under `scripts/`: [`pnpm claude`](../../scripts/claude/AGENTS.md) and [`pnpm claude-list`](../../scripts/claude-list/AGENTS.md). It is a private package with no build. `exports` points at `src/index.ts`, and the scripts' Node strips the types at run time. That works because pnpm's workspace symlink resolves to this folder: Node refuses to strip types under `node_modules`. The scripts' `tsconfig.json` limits (`erasableSyntaxOnly`, `verbatimModuleSyntax`) therefore apply here too.

It stays scoped to what the scripts share: listing worktrees, the current and main checkout paths, and a `git` runner. Logic only one script uses stays in that script.
