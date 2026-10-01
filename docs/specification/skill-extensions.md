# Skill Extensions

Skills under `.agents/skills/` (symlinked into `.claude/skills/`) are installed from an external source and are never edited — see [AGENTS.md](../../AGENTS.md). Repo-specific rules that layer onto a skill's behavior live here instead, one section per skill. Before running a skill listed below, apply its extension rules on top of the skill's own instructions. AGENTS.md's GitHub rules (the `CLAUDE(<type>): ` subject format, the `CLAUDE: ` prose prefix, never merging a PR yourself) apply throughout.

## `/grill-with-docs`

The session itself writes nothing. Once it concludes and the resulting ADR/glossary doc changes are written, commit just those doc changes with type `docs` (e.g. `CLAUDE(docs): record ADR-0026`), so ADR-only commits are distinguishable in history.

## `/grilling`

The deliverable is a GitHub issue capturing the agreed design. Until the interview is over and the user asks for implementation, the repository stays untouched, including glossary or doc content the user just settled in an answer: record settled decisions in the issue body instead. Read-only exploration is expected. When the question frontier is empty and the user confirms shared understanding, write the issue and stop.

## `/to-spec`

A spec is a parent issue, not something implemented directly — the whole spec is too large to land as one change. Label it `spec` (in addition to whatever the skill's own instructions say), and never `ready-for-agent`: that label means "grabbable and implementable as-is," which a spec is not until `/to-tickets` has broken it down.

Besides publishing the GitHub issue, write the same spec content to `docs/specification/<slug>.md` and land it through a PR. Cross-link the two: the file's top references its issue number, the issue body references the file path.

## `/to-tickets`

Each ticket must be small enough to implement as one self-contained unit of work — the whole reason a spec gets broken down. Publish every ticket as its own GitHub issue with the skill's `## Parent` section filled in to link back to the spec issue, never omitted for pipeline tickets even though the skill's template treats it as optional. Label each `ticket` (in addition to whatever the skill says, e.g. `ready-for-agent`); `spec` belongs only on the parent.

## `/implement`

Scope: spec issues (labeled `spec`) and their child tickets (labeled `ready-for-agent`, with a `## Parent` link to a spec) — issues that came through the `/to-spec` → `/to-tickets` pipeline. Any other `#<int>` reference follows AGENTS.md's Issue Resolution Workflow instead: one `issue/<n>-<slug>` branch, one PR into `main`.

Pipeline work uses three branch levels:

- **Spec branch**: the first time any of a spec's tickets is implemented, create `spec/<issue-number>-<spec-slug>` off `main` (e.g. `spec/10-jwt-verified-trusted-proxy-identity`) if it doesn't exist. It is the integration branch every child ticket's PR targets.

- **Ticket branch**: for each ticket, branch `ticket/<issue-number>-<ticket-slug>` off the **spec branch**, not `main` (e.g. `ticket/11-jwt-verified-trusted-proxy-for-apps-bff`). Implementation, TDD and the full post-modification checklist happen there exactly as normal; branching off the spec branch is the only change from the non-pipeline flow.

- **Ticket PR**: once the ticket is done (checklist green, `/code-review` findings addressed), push and open a PR into the _spec branch_. A closing keyword won't fire on that merge, so state the relationship as prose (e.g. "Part of #14, resolves #16"), then comment on the ticket issue linking the PR — not a bare commit, since there's no `main` commit yet.

- **Spec PR**: once at least one ticket has merged into the spec branch (a PR into `main` needs a diff), open a PR from the spec branch into `main` if one doesn't exist. This one does target `main`, so its body carries real closing keywords for the spec issue and every child ticket that landed in it (e.g. "Closes #14. Closes #16. Closes #17."). Open it as a **draft**: it represents the whole spec and should merge only once every child ticket is in, and draft status guards against an early merge. The user promotes and merges it.
