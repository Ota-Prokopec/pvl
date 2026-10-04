# AGENTS.md

`PVL` (Precompiled Validation Library) is a validation library that can compile schemas into optimized code (e.g. `if`/`for`) for fast runtime validation. It's a pnpm + Turborepo TypeScript monorepo, and two packages define the project:

- **[`packages/schema`](./packages/schema/AGENTS.md)** (npm `@pvl/schema`): a Zod-style schema-validation library. Implemented.
- **[`packages/schema-compiler`](./packages/schema-compiler/AGENTS.md)** (npm `@pvl/schema-compiler`): the ahead-of-time compiler that turns `pvl.compile(...)`-marked schemas into `Compiled Schema`s. Not implemented yet.

[`MONOREPO.md`](./MONOREPO.md) lists every other workspace entry. Each entry has its own `AGENTS.md` with its technology, architecture, coding style and package-specific commands. Read it before working inside that entry.

## Read only what the task needs

| Before you…                                              | Read                                                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| run a root command, or check that a change is done       | [`README.md`](./README.md): the commands and the post-modification checklist                                                                                            |
| branch, commit, push, open a PR, or touch a GitHub issue | [`docs/agents/git-workflow.md`](./docs/agents/git-workflow.md)                                                                                                          |
| write, refactor or review code                           | the standard for each technology involved, in [`docs/standards/`](./docs/standards/), plus [`docs/specification/`](./docs/specification/) for the area it covers        |
| work on domain code, or name a domain concept            | [`CONTEXT.md`](./CONTEXT.md) (the glossary) and the ADRs in [`docs/adr/`](./docs/adr/) that touch the area; [`docs/agents/domain.md`](./docs/agents/domain.md) says how |
| run any skill                                            | [`docs/specification/skill-extensions.md`](./docs/specification/skill-extensions.md), for that skill's repo-specific rules                                              |

## Core rules

- pnpm workspace, ESM modules only.
- **A task is done only when the post-modification checklist in [`README.md`](./README.md) passes.** Fix the root cause of a failure. Never suppress it with an ignore comment or a skip flag.
- Prefer an existing npm package over implementing functionality from scratch.
- Scope every non-global `.env` into its app as `.env.production` or `.env.development`.
- A change that is an architectural decision gets an ADR in [`docs/adr/`](./docs/adr/).
- **[`CONTEXT.md`](./CONTEXT.md) is the living glossary and domain model.** Update a term's entry in the same change that coins, renames or redefines it. Each entry cross-links the ADR or spec doc that owns it.
- **Tests cover every error and warning path**, not only the happy path: enumerate every diagnostic a component (CLI included) can produce and write a case per diagnostic. Where a reference implementation exists (the interpreted `@pvl/schema` path for the compiler), compare output against it rather than asserting it is non-empty.
- **Supporting tooling stays proportionate** to the library and compiler it serves (docs harnesses, codegen steps, check scripts). Reach for an off-the-shelf mechanism first, measure the real cases before generalising, and prefer a dumber mechanism that fails loudly over a bespoke parser. Being asked to justify a file's size is the signal to shrink it.
- **Persist knowledge in the repo.** A workflow, convention or correction meant to outlive the session goes into an agentic `*.md` file here (an `AGENTS.md`, or a doc under `docs/agents/` linked from one), never into the agent's internal memory. Keep each file scoped to one concern and link it from the table above or from an entry's `AGENTS.md`, so an agent reads only what its task needs.
- **No "Source Layout" sections in any `AGENTS.md`.** A file tree with per-file descriptions goes stale the moment a file moves. Document a file's purpose in a short comment at the top of that file (or, for a directory, its barrel).
- **Root commands live only in [`README.md`](./README.md).** An `AGENTS.md` lists only the commands specific to its own entry.
- **Never edit a skill under `.agents/skills/` (or its `.claude/skills` symlink).** Skills are installed from an external source, so a hand edit is lost on the next install. Raise a needed behaviour change with the user. Repo-specific layers on top of a skill go in [`docs/specification/skill-extensions.md`](./docs/specification/skill-extensions.md).
