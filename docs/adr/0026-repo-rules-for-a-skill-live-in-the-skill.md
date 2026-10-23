# Repo rules for a skill live in the skill itself

A skill's repo-specific rules are written into its own `SKILL.md`, at the step they change, even when `skills-lock.json` lists the skill as installed from an external source. An update overwrites those files, so it lands as its own PR, and the rules its diff deletes are restored before the merge.

Rejected: a separate extensions doc layered on top of untouched skills. Every run had to reconcile a skill's step with an override in another file.
