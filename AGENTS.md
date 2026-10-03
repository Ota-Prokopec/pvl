# AGENTS.md

`PVL` (Precompiled Validation Library) is a validation library that can compile schemas into optimized code (e.g. `if`/`for`) for fast runtime validation.
Project is a pnpm + Turborepo TypeScript monorepo. Two packages define the project:

- **[`packages/schema`](./packages/schema/AGENTS.md)** (npm `@pvl/schema`) — a schema-validation library in the spirit of [Zod](https://zod.dev): compose schemas and validate values against them at runtime. Implemented; see the `zod` skill.
- **[`packages/schema-compiler`](./packages/schema-compiler/AGENTS.md)** (npm `@pvl/schema-compiler`) — the ahead-of-time compiler. Statically parses schema source (ts-morph) for `pvl.compile(...)` markers and emits a single `Destination File` in which each marked schema is a `Compiled Schema` running straight-line instructions instead of walking the schema tree at runtime. Not implemented yet.

Supporting entries, each with its own `AGENTS.md`: [`apps/playground`](./apps/playground/AGENTS.md) (private scratch app for watching `@pvl/schema` work), [`apps/docs`](./apps/docs/AGENTS.md) (VitePress guide pages plus a TypeDoc-generated API reference; deployment not set up), [`scripts/claude`](./scripts/claude/AGENTS.md) and [`scripts/claude-list`](./scripts/claude-list/AGENTS.md) (the `pnpm claude` and `pnpm claude-list` developer scripts; `scripts/` holds one package folder per script), [`packages/git-worktrees`](./packages/git-worktrees/AGENTS.md) (the worktree reader both scripts share), [`packages/types`](./packages/types/AGENTS.md) (shared TypeScript types). `packages/eslint-config` and `packages/typescript-config` are the shared lint/type-check config packages.

Read an entry's own `AGENTS.md` before working inside it — full technology, architecture and coding-style detail lives there, not here. [`MONOREPO.md`](./MONOREPO.md) inventories the workspace; [`CONTEXT.md`](./CONTEXT.md) is the domain glossary.

## Commands

Run from the repo root; Turborepo fans each one out across the workspace.

- `pnpm dev` — watch/dev mode for every app and package
- `pnpm docs:dev` / `pnpm docs:build` — generate the API reference, then serve or build the documentation site
- `pnpm claude [claude args]` — pick a git worktree (or create one) from a menu and start Claude Code there with `--dangerously-skip-permissions`
- `pnpm claude-list` — pick git worktrees from a menu and remove them, together with their branches
- The six checklist commands below
- Before every commit, lefthook's `pre-commit` hook ([`lefthook.yml`](./lefthook.yml)) runs `pnpm format` (re-adding its fixes to the commit), then `pnpm lint` and `pnpm check-types`

## Post-Modification Checklist

After **every** code change — no exceptions — run these and fix any failure before considering the task done:

```bash
pnpm format        # auto-fixes; the rest must each exit zero
pnpm format:check
pnpm lint
pnpm check-types   # typechecks every app and package
pnpm test          # every package's unit + integration suites
pnpm build         # builds every app and package
```

Do not report a task as complete if any of these commands exit with a non-zero status. Fix the root cause; do not suppress errors with ignore comments or skip flags.

## Issue Tracker

Issues live as GitHub issues on `Ota-Prokopec/pvl`, managed via the `gh` CLI. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) for the full conventions (creating, reading, commenting, labeling, and the wayfinding operations).

## Triage Labels

This repo uses the default canonical five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

## Core Rules

- Package manager pnpm, ESM modules, node_modules hoisted to the root `node_modules/`.
- **Never skip the pre-commit hook** — no `git commit --no-verify`, no `LEFTHOOK=0`, nothing else that bypasses it. When it fails, fix the reported failure and commit again.
- Prefer an existing npm package over implementing functionality from scratch.
- Scope every non-global `.env` into its app as `.env.production` or `.env.development`.
- A change that is an architectural decision gets an ADR in [`docs/adr/`](docs/adr/).
- **[`CONTEXT.md`](CONTEXT.md) is the living glossary and domain model.** Read it before working on unfamiliar domain code, and update a term's entry in the same change that coins, renames or redefines it. Each entry cross-links the ADR or spec doc that owns it.
- **Tests cover every error and warning path**, not only the happy path: enumerate every diagnostic a component (CLI included) can produce and write a case per diagnostic. Where a reference implementation exists (the interpreted `@pvl/schema` path for the compiler), compare output against it rather than asserting it is non-empty.
- **Supporting tooling stays proportionate** to the library and compiler it serves (docs harnesses, codegen steps, check scripts). Reach for an off-the-shelf mechanism first, measure the real cases before generalising, and prefer a dumber mechanism that fails loudly over a bespoke parser. Being asked to justify a file's size is the signal to shrink it.
- **Persist knowledge in the repo.** A workflow, convention or correction meant to outlive the session goes into an agentic `*.md` file here (an `AGENTS.md`, or a doc under `docs/agents/` with a pointer from one), never into the agent's internal memory.
- **No "Source Layout" sections in any `AGENTS.md`.** A file tree with per-file descriptions goes stale the moment a file moves, and duplicates what belongs next to the code. Document a file's purpose in a short comment at the top of that file (or, for a directory, its barrel).
- **Skills under `.agents/skills/` (and their `.claude/skills` symlinks) are installed from an external source — raise a needed behavior change with the user instead of editing the file.** A hand edit is silently lost on the next install. Repo-specific layers on top of a skill live in [docs/specification/skill-extensions.md](docs/specification/skill-extensions.md).

## GitHub

Issues and specs live as GitHub issues on `Ota-Prokopec/pvl`, driven through the `gh` CLI — see [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md) for the concrete commands and the wayfinding operations, and [docs/agents/triage-labels.md](docs/agents/triage-labels.md) for the triage label vocabulary.

All GitHub activity by Claude Code must be identifiable as such:

- **Subject lines — commit messages, issue titles, PR titles — use `CLAUDE(<type>): <short description>`**, where `<type>` is `feat`, `fix`, `docs`, `refactor`, `test` or `chore` (e.g. `CLAUDE(feat): add combined self-hosted image`).
- Everything else posted to GitHub (issue comments, PR bodies, close descriptions) is prose and takes the plain `CLAUDE: ` prefix.
- **All finished work lands through a pull request — never a commit straight to `main`.** Branch, commit, push, open the PR, and leave the merge to the user; the agent never merges its own PR.
- **Every PR body states the issue(s) it addresses.** Targeting `main`, use a closing keyword (`Closes #<n>`) so the user's merge auto-closes the issue — the agent still never closes an issue itself. Targeting an intermediate branch (e.g. a spec integration branch), a keyword won't fire, so state the relationship in prose (`Part of #14, resolves #16`) and let the eventual PR into `main` carry the closing keyword.

### Issue Resolution Workflow

`#<int>` (e.g. `#5`) means issue number `<int>` in this repo.

- Branch off `main` as `issue/<number>-<slug>` (e.g. `issue/5-fix-flag-cache-eviction`), commit the fix there, push, and open a PR into `main` whose body says `Closes #<number>`. Then post a `CLAUDE: ` comment on the issue linking the PR.
- Every solved issue — parent or sub-issue — gets its own dedicated commit; never bundle two issues into one commit.
- Before starting an issue, look up its sub-issues (`gh issue view <int> --json subIssues`, falling back to `gh api` on older `gh`). A parent with sub-issues is an orchestration issue: sub-issues have to be solved individually first. Already-implemented sub-issue work is never re-implemented or duplicated; report any that are still pending instead. Once every sub-issue is done, post a `CLAUDE: ` comment on the parent linking all of their PRs.
- **Sub-issues** branch and PR through a parent branch rather than `main` — follow [docs/agents/sub-issue-workflow.md](docs/agents/sub-issue-workflow.md).

## Required Context Loading

Before writing, refactoring or reviewing code, read the standards file for the technology involved and follow it strictly:

| Technology      | File                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| TypeScript      | [docs/standards/typescript.md](docs/standards/typescript.md) (strict TypeScript; JavaScript is prohibited) |
| `tsconfig.json` | [docs/standards/tsconfig.json.md](docs/standards/tsconfig.json.md)                                         |
| Turborepo       | [docs/standards/turborepo.md](docs/standards/turborepo.md)                                                 |
| React           | [docs/standards/react.md](docs/standards/react.md)                                                         |
| TanStack Query  | [docs/standards/tanstack-query.md](docs/standards/tanstack-query.md)                                       |
| Shadcn UI       | [docs/standards/shadcnui.md](docs/standards/shadcnui.md)                                                   |
| Dotenvx         | [docs/standards/dotenvx.md](docs/standards/dotenvx.md)                                                     |

## Specification

Repo-wide conventions live in `docs/specification/`. Read the relevant one before touching the area it covers:

- [Enums and Constants](docs/specification/enums-and-constants.md)
- [Skill Extensions](docs/specification/skill-extensions.md)
- [Standard Schema](docs/specification/standard-schema.md)

## Decision history

Architectural decisions are recorded as ADRs in [`docs/adr/`](./docs/adr/):

- [ADR-0001](./docs/adr/0001-adopt-standard-schema.md) — adopt Standard Schema for `@pvl/schema`
- [ADR-0002](./docs/adr/0002-static-ast-compilation-via-ts-morph.md) — compile schemas via static AST analysis, not runtime introspection
- [ADR-0003](./docs/adr/0003-compiled-schemas-conform-to-standard-schema.md) — `Compiled Schema`s conform to StandardSchemaV1
- [ADR-0004](./docs/adr/0004-dual-esm-cjs-publish-via-tsup.md) — publish `@pvl/schema` and `@pvl/schema-compiler` as dual ESM+CJS
- [ADR-0005](./docs/adr/0005-compiler-emits-a-destination-file-and-rewrites-nothing.md) — the compiler emits one Destination File and rewrites nothing
- [ADR-0006](./docs/adr/0006-chained-instance-method-api-via-shared-base-schema-class.md) — chained-instance-method API via a shared base `ChainableSchema` class
- [ADR-0007](./docs/adr/0007-object-strips-unknown-keys-by-default.md) — `object()` strips unknown keys by default
- [ADR-0008](./docs/adr/0008-no-regex-backed-constraints-in-v1.md) — no regex-backed constraint helpers in v1
- [ADR-0009](./docs/adr/0009-enum-accepts-const-object-or-string-literal-array.md) — `enum()` accepts either an `as const` object or a string-literal array
- [ADR-0010](./docs/adr/0010-modifiers-run-in-chain-order-around-the-type-check.md) — Modifiers run in chain order as pre-/post-modifiers around the type check, special behaviour declared by tags
- [ADR-0011](./docs/adr/0011-result-failure-branch-carries-pvl-issue.md) — `Result`'s failure branch carries `@pvl/schema`'s own `Issue`
- [ADR-0012](./docs/adr/0012-composite-schemas-collect-every-issue.md) — Schemas collect every `Issue`: every child, every post-modifier, and a union's `INVALID_UNION` plus every member's rejection
- [ADR-0013](./docs/adr/0013-pin-formatting-rules-via-root-prettierrc.md) — pin formatting rules via a root `.prettierrc.json`
- [ADR-0014](./docs/adr/0014-typedoc-pinned-to-typescript-5-9.md) — TypeDoc runs against TypeScript 5.9 in `apps/docs` (superseded by ADR-0021)
- [ADR-0015](./docs/adr/0015-compiled-schema-destination-resolution.md) — the Destination File defaults into the application's own `node_modules`
- [ADR-0016](./docs/adr/0016-transform-and-compile-end-the-modifier-chain.md) — `.transform()` and `pvl.compile()` end the Modifier chain, returning a plain `Schema`
- [ADR-0017](./docs/adr/0017-inline-with-delegation-code-generation.md) — generated code inlines within a node and delegates at composite boundaries
- [ADR-0018](./docs/adr/0018-composite-fields-are-pvl-schemas-only.md) — composite fields and elements are `@pvl/schema` Schemas only
- [ADR-0019](./docs/adr/0019-factories-take-no-options.md) — factories take no options; `{ message }` exists only on Modifiers that report an `Issue`
- [ADR-0020](./docs/adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md) — `Schema` is the base class owning the pipeline and the internal Modifier helpers, `ChainableSchema` adds only the Shared Modifiers; `pvl.compile()` returns a plain `Schema` and a Compiled Schema is a `Schema` subclass
- [ADR-0021](./docs/adr/0021-whole-repo-on-typescript-6-0-3.md) — the whole repo runs on TypeScript 6.0.3, since typescript-eslint and TypeDoc don't accept 7
- [ADR-0022](./docs/adr/0022-conventions-enforced-by-lint-not-restated-in-prose.md) — conventions that lint enforces (`@repo/conventions`) aren't restated in prose, and inline disable comments are off

Domain documentation is single-context: one root [`CONTEXT.md`](CONTEXT.md) plus [`docs/adr/`](docs/adr/), no per-package `CONTEXT.md` — see [docs/agents/domain.md](docs/agents/domain.md) for how the engineering skills consume it.

When using any skill, follow this extended skills specification if the used skill is included: [docs/specification/skill-extensions.md](docs/specification/skill-extensions.md).
