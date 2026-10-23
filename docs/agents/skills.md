# Skills

How this repo runs, edits and updates the agent skills under `.agents/skills/` (symlinked into `.claude/skills/`).

## The pipeline

A feature runs through the skills in this order: `/wayfinder` (map the unknowns) → `/grill-with-docs` (settle what to build and why, recorded as ADRs) → `/to-spec` → `/to-tickets` → `/implement-spec` (the whole spec in one run) or `/implement` (one ticket at a time) → `/code-review`.

## Editing a skill

Every skill is edited in place, including those [`skills-lock.json`](../../skills-lock.json) lists as installed from an external source. A repo-specific rule goes into the skill's own `SKILL.md`, at the step it changes ([ADR-0026](../adr/0026-repo-rules-for-a-skill-live-in-the-skill.md)).

## Updating a skill

Reinstalling or updating a skill from its source overwrites its files wholesale, so the update lands as its own PR. Before merging it, restore every repo rule the diff deletes.
