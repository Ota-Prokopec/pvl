# The GitHub wiki is published from `docs/wiki/`

**The GitHub wiki's pages are written in `docs/wiki/`, one Markdown file per page, and `.github/workflows/wiki.yml` publishes that folder on every push to `main` that changes it, through `Andrew-Chen-Wang/github-wiki-action`. The wiki is for people working on and with the library, explaining each Schema, interpreted and compiled, in its own words with Mermaid graphs. `docs/specification/` and the ADRs stay the agents' documents, which a wiki page may link as further reading.** The action mirrors the folder, so the wiki is exactly `docs/wiki/`, and an edit made in the wiki itself is overwritten by the next publish.

The wiki is a separate git repo that no PR reviews and no agent reads, so pages written there would drift from the code unseen. In the repo, a page is changed in the same PR as the code it describes, and [`docs/agents/wiki.md`](../agents/wiki.md) makes that a rule.

## Considered options

- **Pages pushed to the wiki repo by hand.** Nothing to set up, but every page lives outside review and goes stale silently. Rejected.
- **A wiki workspace entry (`apps/wiki/`).** A `package.json`, an `AGENTS.md` and a `MONOREPO.md` entry for plain Markdown with no build. Rejected as disproportionate.
- **`apps/docs`, the documentation site.** It documents `@pvl/schema` for its users through its API reference; the wiki explains how both packages work inside. Kept apart.

## Consequences

- A relative link works both in the repo and in the wiki: the action turns one to another page into a wiki link, and one to a repo file into a link to it on GitHub.
- Prettier formats the pages like every other `*.md` file.
- The compiled code a page shows is real `pvl compile` output, pasted by hand; nothing regenerates or checks it, so the rule in `docs/agents/wiki.md` is what keeps it current.
