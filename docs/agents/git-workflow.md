# Git workflow

Read this before you create a branch, commit, push, open or edit a PR, or create or comment on an issue. Issues live as GitHub issues on `Ota-Prokopec/pvl`, driven through the `gh` CLI: [issue-tracker.md](./issue-tracker.md) has the commands and the wayfinding operations, [triage-labels.md](./triage-labels.md) the label vocabulary.

## Naming

- **Branches** are `<type>/<slug>`: `<type>` is one of the types below, `<slug>` is lowercase kebab-case (`feat/enum-factory`, `chore/agents-system-refactor`). A Claude Code worktree starts on a `worktree-<name>` branch, so rename it with `git branch -m <type>/<slug>` before the first commit.
- **Commit subjects, PR titles and issue titles** follow [Conventional Commits](https://www.conventionalcommits.org): `<type>(<scope>): <description>`, with the scope optional (`feat(schema): add pvl.enum()`, `chore: move the repo to TypeScript 6.0.3`). `<type>` is `feat`, `fix`, `docs`, `refactor`, `test` or `chore`; `<scope>` is lowercase kebab-case, usually the workspace entry's folder name.
- **Nothing posted to GitHub mentions Claude.** That covers PR titles and bodies, issue titles, bodies and comments: no `CLAUDE` prefix, and no "Generated with Claude Code" footer.

## Commits

- **Never skip the pre-commit hook**: no `git commit --no-verify`/`-n`, no `LEFTHOOK=0`/`LEFTHOOK_EXCLUDE`, no `core.hooksPath` override. When it fails, fix the reported failure and commit again.
- Every solved issue, parent or sub-issue, gets its own dedicated commit. Never bundle two issues into one commit.

## Pull requests

- **All finished work lands through a PR, never a commit or push straight to `main`.** Branch, commit, push, open the PR. The user merges it, never the agent.
- **Every PR body states the issue(s) it addresses.** A PR into `main` uses a closing keyword (`Closes #<n>`) so the user's merge closes the issue. The agent never closes an issue itself. A PR into an intermediate branch (a parent or spec branch) can't fire a keyword, so it states the relationship in prose (`Part of #14, resolves #16`), and the eventual PR into `main` carries the closing keywords.

## Resolving an issue

`#<int>` (e.g. `#5`) means issue number `<int>` in this repo.

1. Look up its sub-issues first (`gh issue view <n> --json subIssues`, falling back to `gh api` on older `gh`). A parent with sub-issues is an orchestration issue: solve each sub-issue on its own, following [sub-issue-workflow.md](./sub-issue-workflow.md). Never re-implement sub-issue work that is already done. Report any sub-issue that is still pending instead.
2. Otherwise branch off `main` as `<type>/<slug>`, commit, push, and open a PR into `main` whose body says `Closes #<n>`. Then comment on the issue linking the PR.
3. Once every sub-issue of a parent is done, comment on the parent linking all of their PRs.

Issues that came through the `/to-spec` → `/to-tickets` pipeline follow the `/implement` section of [skill-extensions.md](../specification/skill-extensions.md) instead.
