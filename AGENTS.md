# AGENTS.md

## Architecture

- main architecture: turborepo monorepo
- package manager: pnpm
- programming language: TypeScript

  `pvl` is split into two pieces:

- **[`packages/schema`](./packages/schema/AGENTS.md)** (npm: `@pvl/schema`) — a standalone schema-validation library in the spirit of [Zod](https://zod.dev): compose schemas and validate values against them at runtime. See the Zod skill.

- **[`packages/schema-compiler`](./packages/schema-compiler/AGENTS.md)** (npm: `@pvl/schema-compiler`) — the "ahead-of-time" compiler. Statically parses schema source (via ts-morph) for `pvl.compile(...)` markers and compiles those schemas into a plain, dependency-free set of instructions instead of walking the schema tree at runtime.

Both directories exist with their own `AGENTS.md` (full technology/architecture/coding-style detail lives there, not here); neither has any implementation yet. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the cross-package shape and [CONTEXT.md](./CONTEXT.md) for the domain glossary.

The default `create-turbo` starter apps (`apps/web`, `apps/docs`) have been removed — `apps/` is kept as an empty placeholder directory for a future app. `packages/eslint-config` and `packages/typescript-config` remain as generic shared config, reusable by `@pvl/schema`/`@pvl/schema-compiler`. `packages/ui` also remains, but it has no current consumer now that `apps/web`/`apps/docs` are gone; it's kept intentionally for a future app rather than repurposed or removed — treat it as unused-but-deliberate scaffolding, not project code.

## Root Commands

Run from the repo root (executed across the workspace via Turborepo):

- `pnpm build` — build all apps and packages
- `pnpm dev` — run all apps and packages in watch/dev mode
- `pnpm lint` — lint all apps and packages
- `pnpm format` — format the repo with Prettier
- `pnpm check-types` — typecheck all apps and packages
- `pnpm format:check` — check formatting without writing (non-writing Prettier check)

> `pnpm test` is referenced by the Post-Modification Checklist below but is not yet defined in the root `package.json` — add it (fanned out via `turbo run test`, plus a corresponding `test` task in `turbo.json`) when the first package lands.

## Issue Tracker

Issues live as GitHub issues on `Ota-Prokopec/pvl`, managed via the `gh` CLI. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) for the full conventions (creating, reading, commenting, labeling, and the wayfinding operations).

## Triage Labels

This repo uses the default canonical five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

## Domain Docs

Single-context layout: one `CONTEXT.md` and `docs/adr/` at the repo root (no per-package `CONTEXT.md`). See [docs/agents/domain.md](docs/agents/domain.md).

## Core Rules

- Package manager: pnpm
- Modules: ESM
- Always scope non-global .env into particular app as .env.production for production or .env.development for development
- node_modules are stored in root node_modules/ folder
- All GitHub activity performed by Claude Code must be identifiable as such. **Subject lines — commit messages, issue titles, and PR titles — use the conventional-commit-style format `CLAUDE(<type>): <short description>`**, where `<type>` is one of `feat` (new capability), `fix` (bug fix), `docs` (documentation only, e.g. an ADR), `refactor` (no behavior change), `test` (test-only change), or `chore` (tooling/config/deps) — e.g. `CLAUDE(feat): add combined self-hosted image`. Everything else posted to GitHub (issue comments, PR descriptions/bodies, close descriptions) is prose, not a subject line, and keeps the plain `CLAUDE: ` prefix instead.
- **Every PR body must state which issue(s) it addresses.** If the PR targets the repo's default branch (`main`), use a GitHub closing keyword (`Closes #<n>` / `Resolves #<n>`) so merging auto-closes the issue — the agent still never closes an issue directly, but letting the user's merge trigger the auto-close is fine. If the PR targets an intermediate branch instead (e.g. a spec integration branch, not `main`), a closing keyword won't actually fire on that merge — state the relationship in plain prose instead (e.g. "Part of #14, resolves #16") and let the eventual PR into `main` carry the real closing keyword.
- **All finished work must land through a pull request — never commit directly to `main`.** Branch, commit, push, and open a PR (title/description prefixed `CLAUDE: `) for the user to review and merge; the agent never merges its own PR. This applies to every piece of done work, not just the issue-driven and spec/ticket pipeline flows below.
- **No "Source Layout" sections in any `AGENTS.md`.** A file tree with per-file/per-directory descriptions goes stale the moment a file is added, renamed, or moved, and duplicates what belongs next to the code. Document a file's purpose as a short comment at the top of that file (or, for a directory, its barrel/index file) instead.
- **[`CONTEXT.md`](CONTEXT.md) (root) is the living glossary and domain model for this project.** It defines precise domain terms — services, entities, auth/role vocabulary, flag-evaluation concepts, contract/schema terminology — each cross-linked to the ADR or spec doc that's the source of truth for it, so AI coding agents don't drift on project jargon. Read it before working on unfamiliar domain code. Whenever a term is coined, renamed, or redefined, update its entry there in the same change.
- **Never write into the `skills/` folder under `.agents/` (or its `.claude/skills` symlinks).** Those skills are installed from an external source — hand edits get silently lost on the next install/sync and don't reflect anywhere the source manages them. If a skill's behavior needs to change, raise it with the user instead of editing the file directly.
- Every entry under `apps/*` and `packages/*` has its own `AGENTS.md` describing its technology, architecture, best practices, and coding style. Read the relevant one before working inside that app/package — in addition to, not instead of, this file.
- If you make a change that is an architectural decision, create or edit an architectural decision record (ADR) in `docs/adr`.

## Required Context Loading

You have access to specific local documentation files for this project. Before writing, refactoring, or reviewing any code, you must use your file-reading tool to read the relevant documentation file from the list below based on the technology you are working with:

- For TypeScript use: [docs/standards/typescript.md](docs/standards/typescript.md) (Strict TypeScript development standards, JavaScript is prohibited)
- For React use: [docs/standards/react.md](docs/standards/react.md) (React architectural patterns and state management)
- For Turborepo use: [docs/standards/turborepo.md](docs/standards/turborepo.md) (Turborepo workspace management and build orchestration)
- For Dotenvx use: [docs/standards/dotenvx.md](docs/standards/dotenvx.md) (Dotenvx multi-environment configuration and vault encryption)
- For Shadcn UI use: [docs/standards/shadcnui.md](docs/standards/shadcnui.md) (Shadcn UI design system and primitive configurations)
- For TanStack Query use: [docs/standards/tanstack-query.md](docs/standards/tanstack-query.md) (Data fetching and mutation patterns in the dashboard)
- For Typescript config files use: [docs/standards/tsconfig.json.md](docs/standards/tsconfig.json.md)

Strictly follow the guidelines found inside these files for every task.

## Specification

Repo-wide conventions live in `docs/specification/`. Read the relevant file before touching the area it covers:

- [Enums and Constants](docs/specification/enums-and-constants.md)
- [Skill Extensions](docs/specification/skill-extensions.md)
- [Standard Schema](docs/specification/standard-schema.md)

Decision history lives in [`docs/adr/`](docs/adr/)

## Post-Modification Checklist

After **every** code change — no exceptions — run all of the following and fix any failures before considering the task done:

```bash
pnpm format        # auto-fix formatting
pnpm format:check  # must pass with zero errors
pnpm lint          # must pass with zero errors
pnpm check-types   # must pass with zero errors
pnpm test          # all unit + integration tests must pass
pnpm build         # build all applications
```

Do not report a task as complete if any of these commands exit with a non-zero status. Fix the root cause; do not suppress errors with ignore comments or skip flags.

## Issue Resolution Workflow

- A reference like `#<int>` (e.g. `#5`) means issue number `<int>` on GitHub in this repo.
- When a referenced issue has subissues, use the `gh` CLI to look up its subissues before starting work (e.g. `gh issue view <int> --json subIssues`, falling back to `gh api` if the field isn't available in the installed `gh` version).
- Every issue that gets solved — parent or subissue — must have its own dedicated commit; do not bundle fixes for multiple issues into one commit.
- For a parent issue with subissues, solve and commit each subissue individually first, one commit per subissue immediately after it's solved.
- Every commit produced by this workflow must use the `CLAUDE(<type>): <description>` format per the GitHub activity rule above.
- Per the pull-request rule above, never commit an issue's fix straight to `main`. Branch off `main` named `issue/<issue-number>-<slug>` (e.g. `issue/5-fix-flag-cache-eviction`), commit the fix there, push the branch, and open a PR into `main` — title `CLAUDE(<type>): <description>`, body stating `Closes #<issue-number>` (this PR targets `main` directly, so the closing keyword fires on merge).
- Once the PR is open, post a `CLAUDE: ` comment on the issue linking to the PR — do not close the issue yourself; the `Closes #<n>` keyword in the PR body handles that automatically once the user merges. Once every subissue of a parent is done this way, post the same kind of comment on the parent linking to all of its subissues' PRs.
- The agent never merges a PR — every merge is the user's action, performed on GitHub.

### Parent issues and sub-issues

When implementing an issue that has sub-issues:

- Treat the parent issue as an orchestration/integration issue.
- Before implementing a parent issue, inspect its sub-issues.
- If all required sub-issues are already implemented, do not re-implement their work.
- Instead, verify that the sub-issue implementations together satisfy the parent issue.
- Run relevant tests, typechecks, linting, and integration checks.
- Complete any remaining parent-level work that is not covered by the sub-issues.
- If required sub-issues are not implemented yet, do not duplicate their work. Report which sub-issues are still pending.

## Skills

- When using `/grill-with-docs` skill, do not implement or edit any files.
