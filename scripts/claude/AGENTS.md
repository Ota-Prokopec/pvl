# `scripts/claude` — `pnpm claude`

A developer script, not part of the library or the compiler; nothing depends on it. It shows a [`@clack/prompts`](https://bomb.sh/docs/clack/packages/prompts/) menu of the repo's git worktrees and starts Claude Code in the picked one with `--dangerously-skip-permissions`. Arguments are forwarded to `claude` (`pnpm claude --continue`, `pnpm claude "fix the flaky test"`). The header comment of `src/index.ts` covers what the menu shows.

It is a private workspace package (`claude`, one of the `scripts/*` entries in `pnpm-workspace.yaml`), started from the repo root by the root `package.json` script `"claude": "node scripts/claude/src/index.ts"`. Being a package gives it its own dependencies and a place in the repo-wide `lint` and `check-types` tasks. It reads worktrees through [`@repo/git-worktrees`](../git-worktrees/AGENTS.md), which it shares with [`pnpm claude-list`](../claude-list/AGENTS.md), the command that removes worktrees.

## How it runs

- Node runs `src/index.ts` directly through its built-in type stripping. There is no `tsx`, no `build` script and no `dist/`.
- `tsconfig.json` enforces `erasableSyntaxOnly` and `verbatimModuleSyntax`, which keep the source to syntax Node can strip. Do not add an `enum`, a namespace, a parameter property, or a type import without `type`. A relative import between source files needs a `.ts` extension for Node to resolve it.

## Each worktree needs its own install

The script runs from the checkout you call it in, and Node resolves its dependencies from that checkout's `node_modules`. In a worktree that has never had `pnpm install`, it can't run. Either install there, or run it from the main checkout.

## No tests

Like [`apps/playground`](../../apps/playground/AGENTS.md), this package deliberately has no tests. The script drives an interactive terminal and then hands it to another program, so a test would mostly check its own fakes. Type-checking is the automated check. To test it by hand, put a stub `claude` that prints its working directory and arguments ahead of the real one on `PATH`, and run it in a real terminal; `@clack/prompts` needs a TTY.

## Decisions

- **The menu order is the contract.** The worktree the command runs from comes first, so it is preselected and Enter alone starts Claude Code where you already are. The green last entry creates a new worktree.
- **Creating a worktree is delegated to `claude --worktree [name]`** rather than done with `git worktree add`. That gives the new worktree Claude Code's own naming, branch (`worktree-<name>`), placement under `.claude/worktrees/` and cleanup prompt on exit. The script runs it from the main checkout, so the new worktree is never nested inside the current one. Claude Code's `worktree-<name>` branch doesn't match the repo's `<type>/<slug>` naming, so the Bash hook blocks commits there until the branch is renamed ([git-workflow.md](../../docs/agents/git-workflow.md)).
