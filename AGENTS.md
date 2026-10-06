# AGENTS.md

Each section below says when it applies and which file to read. Read only the sections the current task needs.

## Project

`PVL` (Precompiled Validation Library) is a validation library that can compile schemas into optimized code (e.g. `if`/`for`) for fast runtime validation. It's a pnpm + Turborepo TypeScript monorepo, and two packages define the project:

- **[`packages/schema`](./packages/schema/AGENTS.md)** (npm `@pvl/schema`): a Zod-style schema-validation library. Implemented.
- **[`packages/schema-compiler`](./packages/schema-compiler/AGENTS.md)** (npm `@pvl/schema-compiler`): the ahead-of-time compiler that turns `pvl.compile(...)`-marked schemas into `Compiled Schema`s. In progress: its config and `pvl compile` CLI exist, compilation doesn't yet.

[`MONOREPO.md`](./MONOREPO.md) lists every other workspace entry. Each entry has its own `AGENTS.md` with its technology, architecture, package-specific rules and commands. Code style isn't one of them: ESLint checks it. Read it before working inside that entry.

## Commands

Read [`README.md`](./README.md) before you run a root command or check that a change is done. It holds the commands and the post-modification checklist.

- **Root commands live only in [`README.md`](./README.md).** An `AGENTS.md` lists only the commands specific to its own entry.
- **A task is done only when the post-modification checklist passes.** Fix the root cause of a failure. Never suppress it with an ignore comment or a skip flag.

## GitHub

Read [`docs/agents/git-workflow.md`](./docs/agents/git-workflow.md) before you branch, commit, push, open a PR, or touch a GitHub issue. It covers naming, commits, pull requests and resolving an issue.

## Code

Read the standard for each technology involved in [`docs/standards/`](./docs/standards/), plus [`docs/specification/`](./docs/specification/) for the area the change covers, before you write, refactor or review code.

- **Conventions that lint enforces aren't repeated in prose.** `pnpm lint` reports them, and each rule's message says what to do ([ADR-0022](./docs/adr/0022-conventions-enforced-by-lint-not-restated-in-prose.md)).
- Prefer an existing npm package over implementing functionality from scratch.
- **Supporting tooling stays proportionate** to the library and compiler it serves (docs harnesses, codegen steps, check scripts). Reach for an off-the-shelf mechanism first, measure the real cases before generalising, and prefer a dumber mechanism that fails loudly over a bespoke parser. Being asked to justify a file's size is the signal to shrink it.
- **Document a file's purpose in a short comment at the top of that file** (or, for a directory, its barrel), not in an `AGENTS.md` file tree, which goes stale the moment a file moves.

## Tests

Read [`TESTS.md`](./TESTS.md) before you write, change or review a test. It holds the testing rules every entry follows, and links each package's own testing strategy.

## Domain and decisions

Read [`CONTEXT.md`](./CONTEXT.md) (the glossary) and the ADRs in [`docs/adr/`](./docs/adr/) that touch the area before you work on domain code or name a domain concept. [`docs/agents/domain.md`](./docs/agents/domain.md) says how to use them.

- **[`CONTEXT.md`](./CONTEXT.md) is the living glossary and domain model.** Update a term's entry in the same change that coins, renames or redefines it. Each entry cross-links the ADR or spec doc that owns it.
- A change that is an architectural decision gets an ADR in [`docs/adr/`](./docs/adr/).

## Skills

Read [`docs/specification/skill-extensions.md`](./docs/specification/skill-extensions.md) before you run any skill. It holds each skill's repo-specific rules.

- **Never edit a skill listed in [`skills-lock.json`](./skills-lock.json)** (under `.agents/skills/`, symlinked into `.claude/skills/`). Those skills are installed from an external source, so a hand edit is lost on the next install. Raise a needed behaviour change with the user. A skill under `.agents/skills/` that the lock file doesn't list is owned by this repo and edited like any other file. Repo-specific layers on top of a skill go in [`skill-extensions.md`](./docs/specification/skill-extensions.md).

## Agent docs

- **Persist knowledge in the repo.** A workflow, convention or correction meant to outlive the session goes into an agentic `*.md` file here (an `AGENTS.md`, or a doc under `docs/agents/` linked from one), never into the agent's internal memory. Keep each file scoped to one concern and link it from a section of this file or from an entry's `AGENTS.md`, so an agent reads only what its task needs.
