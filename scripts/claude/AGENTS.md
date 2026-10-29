# `scripts/claude` — `pnpm claude`

A developer script, not part of the library or the compiler; nothing depends on it. It shows a [`@clack/prompts`](https://bomb.sh/docs/clack/packages/prompts/) menu of the repo's git worktrees and starts Claude Code with `--dangerously-skip-permissions` in the picked one. For the worktree you run it from, Claude Code starts in the same terminal. Any other worktree, or a new one the menu creates, opens in a new VS Code window with Claude Code running in its terminal. Arguments are forwarded to `claude` (`pnpm claude --continue`, `pnpm claude "fix the flaky test"`). The header comment of `src/index.ts` covers what the menu shows.

It is a private workspace package (`claude`, one of the `scripts/*` entries in `pnpm-workspace.yaml`), started from the repo root by the root `package.json` script `"claude": "node scripts/claude/src/index.ts"`. Being a package gives it its own dependencies and a place in the repo-wide `lint` and `check-types` tasks. It reads worktrees through [`@repo/git-worktrees`](../git-worktrees/AGENTS.md), which it shares with [`pnpm claude-list`](../claude-list/AGENTS.md), the command that removes worktrees.

## How it runs

- Node runs `src/index.ts` directly through its built-in type stripping. There is no `tsx`, no `build` script and no `dist/`.
- `tsconfig.json` enforces `erasableSyntaxOnly` and `verbatimModuleSyntax`, which keep the source to syntax Node can strip. Do not add an `enum`, a namespace, a parameter property, or a type import without `type`. A relative import between source files needs a `.ts` extension for Node to resolve it.

## Each worktree runs its own install, into the shared store

The script runs from the checkout you call it in, and Node resolves its dependencies from that checkout's `node_modules`. In a worktree that has never had `pnpm install`, it can't run. Either install there, or run it from the main checkout. A worktree the script creates gets its `pnpm install` from the script, before VS Code opens it. If that install fails, the script warns and opens the worktree anyway, so rerun `pnpm install` there.

The install gives the worktree its own dependency set and links its `@repo/*` and `@pvl/*` imports to the worktree's own sources. It links from pnpm's global virtual store [ADR-0025](../../docs/adr/0025-checkouts-share-dependencies-through-pnpm-global-virtual-store.md).

## How the VS Code window starts Claude Code

VS Code's CLI can open a window but can't run a command in it, so the script writes a workspace file, `<worktree>/.vscode/<worktree name>.code-workspace` (gitignored), and opens it with `code --new-window`. The file's one task has `"runOn": "folderOpen"` and runs `claude` with the forwarded arguments in a terminal of the window. This has three consequences:

- **The `code` command must be on `PATH`.** Install it from VS Code's command palette with _Shell Command: Install 'code' command in PATH_.
- **VS Code asks once before it runs an automatic task.** Answer _Allow_, which sets `task.allowAutomaticTasks` to `"on"` in your user settings. VS Code never lets a workspace turn that setting on. If you answered _Disallow_, or `task.allowAutomaticTasks` is already `"off"`, the window opens without Claude Code. Change the answer with _Tasks: Manage Automatic Tasks_.
- **Every opening of the workspace starts Claude Code again**, including VS Code restoring the window after a restart. Each opening uses the arguments of the last `pnpm claude` run that wrote the file, so a forwarded prompt is sent again. A workspace that is already open in a window only gets focused, and no second `claude` starts.

## `--codespace`: a GitHub Codespace instead of a worktree

`pnpm claude --codespace` lists this repo's codespaces by branch, plus a green entry that creates one: on `main`, on the 4-core, 16 GB `standardLinux32gb` machine, with a 30-minute idle timeout and a 7-day retention period, then switched to the `<type>/<slug>` branch you name, which must not exist on `origin` yet ([ADR-0047](../../docs/adr/0047-heavy-agent-work-runs-in-a-github-codespace-from-a-committed-devcontainer.md)). `src/codespace.ts` writes the same workspace file as for a worktree, but inside the codespace over `gh codespace ssh`, and opens it with `code --new-window --file-uri vscode-remote://codespaces+<name>/workspaces/pvl/.vscode/<branch>.code-workspace`. The window's task then starts `claude` in the codespace, and every other argument is forwarded as usual. The codespace's toolchain comes from [`.devcontainer/devcontainer.json`](../../.devcontainer/devcontainer.json).

It needs, once per machine or account:

- **The `codespace` scope on `gh`:** `gh auth refresh -h github.com -s codespace`. Without it, listing fails with that hint.
- **The GitHub Codespaces VS Code extension** (`github.codespaces`), which resolves the `codespaces+<name>` remote.
- **Your dotfiles** for Claude Code's personal settings: turn on _Automatically install dotfiles_ at github.com/settings/codespaces. VS Code's settings, `task.allowAutomaticTasks` included, come over through Settings Sync.
- **A Claude Code login in each new codespace**, on its first run.

## No tests

Like [`apps/playground`](../../apps/playground/AGENTS.md), this package deliberately has no tests. The script drives an interactive terminal and then hands it to another program, so a test would mostly check its own fakes. Type-checking is the automated check. To test it by hand, put stub `claude` and `code` commands ahead of the real ones on `PATH` that print their working directory and arguments, and run the script in a real terminal; `@clack/prompts` needs a TTY. Then open a generated workspace file with the real `code` to check that the window starts `claude`.

## Decisions

- **The menu order is the contract.** The worktree the command runs from comes first, so it is preselected and Enter alone starts Claude Code where you already are. The green last entry creates a new worktree.
- **The script creates new worktrees itself with `git worktree add`, not with `claude --worktree`.** `claude --worktree` starts its session in the calling terminal, but the session has to start in the VS Code window, after the worktree exists. The script copies Claude Code's layout instead: the worktree goes to `.claude/worktrees/` under the main checkout, so it is never nested inside the current worktree. It branches off a freshly fetched `origin/main` (the last fetched one when offline), with no upstream. Two things are lost: Claude Code's cleanup prompt on exit, which would remove a clean worktree while its VS Code window is still open, and the generated name, so the prompt can't be left empty. [`pnpm claude-list`](../claude-list/AGENTS.md) removes worktrees instead.
- **The script asks for the branch, not a worktree name.** The branch has to match the repo's `<type>/<slug>` naming ([git-workflow.md](../../docs/agents/git-workflow.md)), checked with `BRANCH_NAME` from `@repo/conventions/naming`, the pattern the Bash hook uses. So the worktree is committable from the start, with none of the `git branch -m` that `claude --worktree`'s `worktree-<name>` branch needs. The directory takes the branch name with its `/` turned into `+` (`refactor/enum-factory` → `.claude/worktrees/refactor+enum-factory/`), because a `/` would nest it in a `refactor/` directory that isn't a worktree.
- **Every checkout shares the main checkout's turbo cache.** The script sets `TURBO_CACHE_DIR` to `<main checkout>/.turbo/cache` (unless it is already set) for the `claude` it starts, in this terminal and in the workspace task's `env`. A worktree then reuses the builds and checks another checkout already ran, instead of starting cold, which matters when `/implement-spec` runs several implementers at once. `cacheDir` in `turbo.json` can't do it: turbo rejects an absolute path there, and a relative one resolves inside each checkout. A worktree Claude Code creates itself (`claude --worktree`, a subagent's `isolation: "worktree"`) inherits the variable from the session that created it.
