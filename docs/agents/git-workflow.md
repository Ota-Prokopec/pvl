# Git workflow

Read this before you create a branch, commit, push, open or edit a PR, or create or comment on an issue. [issue-tracker.md](./issue-tracker.md) has the `gh` commands, and [triage-labels.md](./triage-labels.md) the labels.

The [`@repo/conventions` hooks](../../packages/conventions/AGENTS.md#hooks) enforce most of this file for Claude Code, and lefthook's `commit-msg` hook checks every commit subject. Other agents aren't bound by the Claude Code hooks, so this file stays the full statement of the rules.

## Naming

- **Branches** are `<type>/<slug>`: `<type>` is one of the types below, `<slug>` is lowercase kebab-case (`feat/enum-factory`, `chore/agents-system-refactor`). A Claude Code worktree starts on a `worktree-<name>` branch, so rename it with `git branch -m <type>/<slug>` before the first commit.
- **Commit subjects, PR titles and issue titles** follow [Conventional Commits](https://www.conventionalcommits.org): `<type>(<scope>): <description>`, scope optional (`feat(schema): add pvl.enum()`, `chore: move the repo to TypeScript 6.0.3`). `<type>` is `feat`, `fix`, `docs`, `refactor`, `test` or `chore`; `<scope>` is lowercase kebab-case, usually the workspace entry's folder name.
- **Everything posted to GitHub reads as the user's own work**: PR titles and bodies, issue titles, bodies and comments carry no `CLAUDE` prefix, no mention of Claude and no "Generated with Claude Code" footer.

## Commits

- **Every commit passes the pre-commit hook.** When it fails, fix the reported failure and commit again. The hook is a guardrail, so these bypasses stay unused: `git commit --no-verify`/`-n`, `LEFTHOOK=0`/`LEFTHOOK_EXCLUDE`, a `core.hooksPath` override.
- **One commit per solved issue**, parent or sub-issue.

## Pull requests

- **All finished work lands through a PR**: branch, commit, push, open the PR. Commits reach `main` only through the user's merge.
- **Every PR body states the issue(s) it addresses.** A PR into `main` uses a closing keyword (`Closes #<n>`), so the user's merge closes the issue. A PR into an intermediate branch (a parent or spec branch) can't fire a keyword, so it states the relationship in prose (`Part of #14, resolves #16`), and the eventual PR into `main` carries the closing keywords.

## Resolving an issue

`#<int>` (e.g. `#5`) means issue number `<int>` in this repo.

1. **Look up its sub-issues** (`gh issue view <n> --json subIssues`, or `gh api` on an older `gh`). A parent with sub-issues is an orchestration issue: solve each open sub-issue with [sub-issue-workflow.md](./sub-issue-workflow.md), and build on the ones already done.
2. **A leaf issue** gets a `<type>/<slug>` branch off `main`, one commit, and a PR into `main` whose body says `Closes #<n>`. Done when the PR is open and the issue carries a comment linking it.
3. **A parent** is done when every sub-issue has a PR and the parent carries a comment linking all of them.

Issues from the `/to-spec` → `/to-tickets` pipeline add the rules in the [`/implement`](../specification/skill-extensions.md#implement) or [`/implement-spec`](../specification/skill-extensions.md#implement-spec) section of skill-extensions.md. `/implement-spec` lands a whole spec through one PR, so its tickets get no PR of their own.
