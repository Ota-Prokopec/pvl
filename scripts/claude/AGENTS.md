# `scripts/claude` — `pnpm claude`

A developer script, not part of the library or the compiler; nothing depends on it. It shows a [`@clack/prompts`](https://bomb.sh/docs/clack/packages/prompts/) menu of the repo's git worktrees and starts Claude Code with `--dangerously-skip-permissions` in the picked one. For the worktree you run it from, Claude Code starts in the same terminal. Any other worktree, or a new one the menu creates, opens in a new VS Code window with Claude Code running in its terminal. Arguments are forwarded to `claude` (`pnpm claude --continue`, `pnpm claude "fix the flaky test"`). The header comment of `src/index.ts` covers what the menu shows.

It is a private workspace package (`claude`, one of the `scripts/*` entries in `pnpm-workspace.yaml`), started from the repo root by the root `package.json` script `"claude": "node scripts/claude/src/index.ts"`. Being a package gives it its own dependencies and a place in the repo-wide `lint` and `check-types` tasks. It reads worktrees through [`@repo/git-worktrees`](../git-worktrees/AGENTS.md), which it shares with [`pnpm claude-list`](../claude-list/AGENTS.md), the command that removes worktrees.

## How it runs

- Node runs `src/index.ts` directly through its built-in type stripping. There is no `tsx`, no `build` script and no `dist/`.
- `tsconfig.json` enforces `erasableSyntaxOnly` and `verbatimModuleSyntax`, which keep the source to syntax Node can strip. Do not add an `enum`, a namespace, a parameter property, or a type import without `type`. A relative import between source files needs a `.ts` extension for Node to resolve it.

## Each worktree needs its own install

The script runs from the checkout you call it in, and Node resolves its dependencies from that checkout's `node_modules`. In a worktree that has never had `pnpm install`, it can't run. Either install there, or run it from the main checkout. A worktree the script creates gets its `pnpm install` from the script, before VS Code opens it. If that install fails, the script warns and opens the worktree anyway, so rerun `pnpm install` there.

## How the VS Code window starts Claude Code

VS Code's CLI can open a window but can't run a command in it, so the script writes a workspace file, `<worktree>/.vscode/<worktree name>.code-workspace` (gitignored), and opens it with `code --new-window`. The file's one task has `"runOn": "folderOpen"` and runs `claude` with the forwarded arguments in a terminal of the window. This has three consequences:

- **The `code` command must be on `PATH`.** Install it from VS Code's command palette with _Shell Command: Install 'code' command in PATH_.
- **VS Code asks once before it runs an automatic task.** Answer _Allow_, which sets `task.allowAutomaticTasks` to `"on"` in your user settings. VS Code never lets a workspace turn that setting on. If you answered _Disallow_, or `task.allowAutomaticTasks` is already `"off"`, the window opens without Claude Code. Change the answer with _Tasks: Manage Automatic Tasks_.
- **Every opening of the workspace starts Claude Code again**, including VS Code restoring the window after a restart. Each opening uses the arguments of the last `pnpm claude` run that wrote the file, so a forwarded prompt is sent again. A workspace that is already open in a window only gets focused, and no second `claude` starts.

## No tests

Like [`apps/playground`](../../apps/playground/AGENTS.md), this package deliberately has no tests. The script drives an interactive terminal and then hands it to another program, so a test would mostly check its own fakes. Type-checking is the automated check. To test it by hand, put stub `claude` and `code` commands ahead of the real ones on `PATH` that print their working directory and arguments, and run the script in a real terminal; `@clack/prompts` needs a TTY. Then open a generated workspace file with the real `code` to check that the window starts `claude`.

## Decisions

- **The menu order is the contract.** The worktree the command runs from comes first, so it is preselected and Enter alone starts Claude Code where you already are. The green last entry creates a new worktree.
- **The script creates new worktrees itself with `git worktree add`, not with `claude --worktree`.** `claude --worktree` starts its session in the calling terminal, but the session has to start in the VS Code window, after the worktree exists. The script copies Claude Code's layout instead: the worktree goes to `.claude/worktrees/<name>/` under the main checkout, so it is never nested inside the current worktree. It gets a `worktree-<name>` branch off a freshly fetched `origin/main` (the last fetched one when offline), with no upstream. Two things are lost: Claude Code's cleanup prompt on exit, which would remove a clean worktree while its VS Code window is still open, and the generated name, so the name prompt can't be left empty. [`pnpm claude-list`](../claude-list/AGENTS.md) removes worktrees instead. The `worktree-<name>` branch doesn't match the repo's `<type>/<slug>` naming, so the Bash hook blocks commits there until the branch is renamed ([git-workflow.md](../../docs/agents/git-workflow.md)).
