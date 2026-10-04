# Domain docs

How to use the glossary and the ADRs when you explore code, name a domain concept, or propose a change.

## Read first

- [`CONTEXT.md`](../../CONTEXT.md): the glossary and domain model.
- The ADRs in [`docs/adr/`](../adr/) that touch the area. Each filename states its decision. An ADR whose frontmatter says `status: superseded by ADR-<n>` is history: follow its successor.

## Speak the glossary

Name every domain concept with its `CONTEXT.md` term, wherever it appears: an issue title, a refactor proposal, a hypothesis, a test name. A concept the glossary lacks is a signal. Either the language is invented, so reach for the existing term, or the glossary has a real gap, so note it for `/domain-modeling`.

## Flag ADR conflicts

When your output contradicts an ADR, name the ADR and say why it's worth reopening:

> _Contradicts ADR-0007 (`object()` strips unknown keys by default), but worth reopening because…_
