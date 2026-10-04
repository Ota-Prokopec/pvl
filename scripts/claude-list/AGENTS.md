# `scripts/claude-list` — `pnpm claude-list`

A developer script, the cleanup companion of [`pnpm claude`](../claude/AGENTS.md); nothing depends on it. It shows a [`@clack/prompts`](https://bomb.sh/docs/clack/packages/prompts/) multiselect of the repo's git worktrees and removes the picked ones, together with their branches. The header comment of `src/index.ts` covers the flow.

It is a private workspace package (`claude-list`) started by the root `package.json` script `"claude-list": "node scripts/claude-list/src/index.ts"`. It reads worktrees through [`@repo/git-worktrees`](../git-worktrees/AGENTS.md), which `pnpm claude` shares. It runs exactly like `pnpm claude`: Node strips the types (same `tsconfig.json` limits), each worktree needs its own `pnpm install`, and there are no tests. See [`scripts/claude/AGENTS.md`](../claude/AGENTS.md) for all three. To test it by hand, build a throwaway repo with a locked, a dirty, an unmerged, a detached worktree, plus deleted-directory worktrees both unlocked (pruned) and locked (skipped: git never reports a locked worktree as prunable) and run the script from it in a real terminal.

## Decisions

- **Removal overrides Claude Code's lock and uncommitted changes** (`git worktree remove --force --force`). Claude Code locks every worktree it creates, so without the double force almost nothing would be removable. The confirmation step, which defaults to No and lists every pick with its `locked` and `dirty` tags, is the safety net instead.
- **Colors carry state.** The main checkout and the current worktree are listed but disabled and gray: the first can't be removed, and removing the second would pull the directory out from under the caller. Dirty worktrees are yellow. Gray wins when both apply.
- **Branches merged into `main` are deleted without asking; unmerged ones are offered in a second multiselect with nothing preselected.** Squash-merged PR branches show up as unmerged, so the prompt is where they get deleted. Deletion uses `git branch -D` even for merged branches, because `-d` checks against the current HEAD rather than `main`.
- **One failing step doesn't stop the rest.** Every removal and deletion is attempted. The summary lists what failed, and the exit code is 1.
