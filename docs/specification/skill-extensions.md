# Skill extensions

Repo-specific rules layered on top of a skill, one section per skill. Before running a skill listed here, apply its section on top of the skill's own instructions. [git-workflow.md](../agents/git-workflow.md) applies to every skill.

A skill listed in [`skills-lock.json`](../../skills-lock.json) is installed from an external source and stays exactly as installed, so its repo-specific changes go here ([AGENTS.md](../../AGENTS.md#skills)).

## The pipeline

A feature runs through the skills in this order: `/wayfinder` (map the unknowns) → `/grill-with-docs` (settle what to build and why, recorded as ADRs; nothing is implemented yet) → `/to-spec` → `/to-tickets` → `/implement` → `/code-review`.

## `/grill-with-docs`

The session writes only `/prototype-code` variants, which that skill deletes before the question closes. Once the session concludes and the ADR and glossary changes are written, commit just those doc changes with type `docs` (`docs(adr): record ADR-0026`), so ADR-only commits stand out in history.

## `/grilling`

Until the interview is over and the user asks for implementation, the repository stays read-only, glossary and docs included. `/prototype-code` is the one writer, run to settle a question about code shape: its variant files are written mid-session and deleted once the user picks a winner. When the question frontier is empty and the user confirms shared understanding, stop.

## `/to-spec`

A spec is a parent issue, too large to land as one change, so `/to-tickets` breaks it down before anything is implemented. Label it `spec`, in addition to the skill's own labels, and keep `ready-for-agent` off it: that label means implementable as-is.

Besides publishing the issue, write the same spec to `docs/specification/<slug>.md` and land it through a PR. Cross-link the two: the file's top names its issue number, and the issue body names the file path.

## `/to-tickets`

Each ticket is one self-contained unit of work, implementable as a single change. Publish every ticket as its own GitHub issue with the skill's `## Parent` section filled in, linking back to the spec issue; for pipeline tickets that section is required, though the skill's template treats it as optional. Label each ticket `ticket`, in addition to the skill's own labels (e.g. `ready-for-agent`); `spec` belongs only on the parent.

## `/implement`

Scope: spec issues (labelled `spec`) and their child tickets (labelled `ticket`, with a `## Parent` link to a spec). Any other `#<int>` follows "Resolving an issue" in [git-workflow.md](../agents/git-workflow.md).

Implement a ticket with [sub-issue-workflow.md](../agents/sub-issue-workflow.md), with the spec as the parent and the ticket as the child: the spec branch (`feat/schema-compiler`) is the parent branch, and each ticket branch (`feat/compiler-cli`) branches off it.

## `/code-review`

The standards sources are [`docs/standards/`](../standards/) (one file per technology), [`TESTS.md`](../../TESTS.md), and the files in `docs/specification/` that cover the changed area. The spec files are both standards and the Spec axis's reference for how a component must behave.

Run `pnpm test` as part of the review, and report each failing test as a finding.
