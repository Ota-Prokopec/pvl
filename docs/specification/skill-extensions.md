# Skill Extensions

Skills under `.agents/skills/` (symlinked into `.claude/skills/`) are installed from an external source — never edit them directly, per the rule in [AGENTS.md](../../AGENTS.md). This file is where repo-specific rules that extend or layer onto a skill's behavior live instead, one section per skill. Before running a skill listed here, apply its extension rules on top of the skill's own instructions.

## `/grill-with-docs`

After the grilling session concludes and the resulting ADR/glossary doc changes are written, commit just those doc changes, using type `docs` per AGENTS.md's `CLAUDE(<type>): <description>` convention (e.g. `CLAUDE(docs): record ADR-0026`), so ADR-only commits are distinguishable in history.

## `/to-spec`

A spec is a parent issue, not something meant to be implemented directly — the whole spec is too large to land as one change. Apply the `spec` label to it (in addition to, not instead of, whatever the skill's own instructions already say). Do not apply `ready-for-agent` to a spec issue — that label means "grabbable and implementable as-is," which a spec is not until `/to-tickets` has broken it down.

In addition to publishing the GitHub issue, write the same spec content to a file under `docs/specification/` (e.g. `docs/specification/<slug>.md`), committed via a PR per AGENTS.md's pull-request rule — never straight to `master`. Cross-link the two: the file's top should reference its GitHub issue number, and the issue body should reference the file path.

## `/to-tickets`

Each ticket produced from a spec must be small enough to implement as one self-contained unit of work — that's the whole reason the spec gets broken down instead of implemented directly. Every ticket must be published to GitHub as its own issue, with the skill's own `## Parent` section filled in to link back to the spec issue — never omit that section for pipeline tickets, even though the skill's own template treats it as optional. Apply the `ticket` label to each one (in addition to, not instead of, whatever the skill's own instructions already say, e.g. `ready-for-agent`) — the `spec` label belongs only on the parent, never on its tickets.

## `/implement`

Scope: applies only to spec issues (labeled `spec`) and their child tickets (labeled `ready-for-agent`, with a `## Parent` link to a spec) — issues that came through the `/to-spec` → `/to-tickets` pipeline. Work on any other `#<int>` issue reference still follows AGENTS.md's Issue Resolution Workflow — a single `issue/<n>-<slug>` branch and one PR into `master` — rather than the spec/ticket branch structure below.

For pipeline work:

- **Spec branch**: the first time any of a spec's tickets is implemented, create a branch off `master` named `spec/<issue-number>-<slug>` (e.g. `spec/10-jwt-verified-trusted-proxy-identity`) if it doesn't already exist. This is the integration branch every child ticket's PR targets — never push ticket commits straight to it.
- **Ticket branch**: for each ticket, branch off the spec branch (not `master`) named `ticket/<issue-number>-<slug>` (e.g. `ticket/11-jwt-verified-trusted-proxy-for-apps-bff`). Do the ticket's implementation, TDD, and the full post-modification checklist there, exactly as normal — the only change from the non-pipeline flow is branching off the spec branch instead of `master`.
- **Ticket PR**: once a ticket is done (checklist green, `/code-review` findings addressed), push the ticket branch and open a PR from it into the _spec branch_ (not `master`) — title `CLAUDE(<type>): <description>` per AGENTS.md. Since this PR doesn't target `master`, a closing keyword won't fire on merge — state the relationship in the body as plain prose instead (e.g. "Part of #14, resolves #16"). Comment on the ticket issue linking the PR (not a bare commit, since there's no master commit yet), same `CLAUDE: ` prefix convention. Do not merge it yourself — that's the user's review/merge action.
- **Spec PR**: once the spec branch has at least one ticket merged into it (a PR into `master` needs a diff to exist, so this can't happen before that), open a PR from the spec branch into `master`, if one doesn't already exist — title `CLAUDE(<type>): <description>`. This PR does target `master`, so its body should carry real closing keywords for the spec issue and every child ticket that landed in it (e.g. "Closes #14. Closes #16. Closes #17."), since merging here is genuinely the point where that work is done. Open it as a **draft** — it represents the whole spec and is only meant to be merged once every child ticket has landed in the spec branch, and draft status guards against it being merged early by mistake. Do not mark it ready for review or merge it yourself; the user promotes and merges it once all tickets are in.
- The agent never merges a PR (ticket or spec) — every merge is the user's action, performed on GitHub.
