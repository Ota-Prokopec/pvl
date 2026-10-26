# Wiki

`docs/wiki/` is the source of the GitHub wiki, published on every push to `main` ([ADR-0037](../adr/0037-the-github-wiki-is-published-from-docs-wiki.md)). Its pages explain each Schema, interpreted and compiled, for people.

- A change to a Schema's behaviour, its interpreted pipeline, its Emitter, the Frame, or a spec or ADR that a wiki page describes updates that page in the same change.
- Compiled code on a page is real `pvl compile` output: compile the page's example again and paste it in.
- Edit pages here, never in the wiki: the next publish overwrites the wiki.
