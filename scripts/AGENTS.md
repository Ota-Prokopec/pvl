# `scripts/`

Developer scripts for working on this repo. They are not part of the library or the compiler, and nothing depends on them. Each script is a single TypeScript file here, started from the repo root through a root `package.json` script (`pnpm <name>`). The directory is a private workspace entry (package `scripts`, listed in `pnpm-workspace.yaml`) so the scripts get their own dependencies and take part in the repo-wide `lint` and `check-types` tasks.

## How the scripts run

- Node runs each `.ts` file directly through its built-in type stripping. There is no `tsx`, no `build` script and no `dist/`.
- `tsconfig.json` enforces `erasableSyntaxOnly` and `verbatimModuleSyntax`, which keep the source to syntax Node can strip. Do not add an `enum`, a namespace, a parameter property, or a type import without `type`.
- Keep a script to one file, read top to bottom. A relative import between scripts would need a `.ts` extension for Node to resolve it, so share code only once a second script really needs it.
- To add a script: put `<name>.ts` here, add any dependency to this directory's `package.json`, and add `"<name>": "node scripts/<name>.ts"` to the root `package.json`.

## Each worktree needs its own install

A script runs from the checkout you call it in, and Node resolves its dependencies from that checkout's `node_modules`. In a worktree that has never had `pnpm install`, the scripts can't run. Either install there, or run them from the main checkout.

## No tests

Like [`apps/playground`](../apps/playground/AGENTS.md), this directory deliberately has no tests. The scripts drive an interactive terminal or hand it to another program, so a test would mostly check its own fakes. Type-checking is the automated check. After changing a script, run it by hand, and substitute a stub for any program it launches.

## `claude.ts` — `pnpm claude`

Shows a [`@clack/prompts`](https://bomb.sh/docs/clack/packages/prompts/) menu of the repo's git worktrees and starts Claude Code in the picked one with `--dangerously-skip-permissions`. Arguments are forwarded to `claude` (`pnpm claude --continue`, `pnpm claude "fix the flaky test"`). The file's header comment covers what the menu shows. The decisions behind it:

- **The menu order is the contract.** The worktree the command runs from comes first, so it is preselected and Enter alone starts Claude Code where you already are. The green last entry creates a new worktree.
- **Creating a worktree is delegated to `claude --worktree [name]`** rather than done with `git worktree add`. That gives the new worktree Claude Code's own naming, branch (`worktree-<name>`), placement under `.claude/worktrees/` and cleanup prompt on exit. The script runs it from the main checkout, so the new worktree is never nested inside the current one.
- To test it by hand, put a stub `claude` that prints its working directory and arguments ahead of the real one on `PATH`, and run it in a real terminal; `@clack/prompts` needs a TTY.
