# Wiki

`docs/wiki/` is the source of the GitHub wiki, published on every push to `main` ([ADR-0037](../adr/0037-the-github-wiki-is-published-from-docs-wiki.md)). Its pages explain each Schema, interpreted and compiled, for people.

- A change to a Schema's behaviour, its interpreted pipeline, its Emitter, the Frame, or a spec or ADR that a wiki page describes updates that page in the same change.
- Compiled code on a page is real `pvl compile` output: compile the page's example again and paste it in.
- Edit pages here, never in the wiki: the next publish overwrites the wiki.
- The docs site links each Schema's and Shared Modifier's page by its file name ([`apps/docs/AGENTS.md`](../../apps/docs/AGENTS.md)). Renaming, removing or adding one of those pages updates `apps/docs/content/guide/schemas.md` in the same change.
- Link a repo file relatively, as an inline `](../…)` link: the publish workflow rewrites that form, and only that form, to the file's URL on `main`.
