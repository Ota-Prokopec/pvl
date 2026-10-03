# Conventions that lint enforces aren't restated in prose, and inline disable comments are off

Every convention in `AGENTS.md` and the files it links to that a machine can check is an ESLint rule, run by `pnpm lint` and so by lefthook's `pre-commit` hook. The custom rules live in the internal package `@repo/conventions`, and `@repo/eslint-config` wires them in beside typescript-eslint, `@eslint/json`, `@eslint/markdown` and `eslint-plugin-jsdoc`. Each custom rule carries a `meta.docs.description` and an error message worded as the instruction to follow.

**Once a rule is enforced, its text is removed from the `.md` files.** The rule's description and message become the only statement of it. Prose keeps only what lint can't check: judgment calls, plus the parts of a rule the linter can't see. Two statements of one rule drift apart, and the linter's version is the one that's actually checked. This surprises a reader, so it's recorded here. `docs/standards/typescript.md` no longer says "use `type`, not `interface`", for example: an agent learns that from the lint error, at the moment it matters.

**`linterOptions.noInlineConfig` is on, so a `// eslint-disable` comment does nothing.** A legitimate exception is built into the rule's own logic, or set as a file-scoped override in the ESLint config. Two examples:

- An import alias is allowed when the imported name clashes with another binding.
- An `interface` is allowed when its body uses polymorphic `this`, or a class in the same file implements it.

The root `AGENTS.md` already forbids suppressing errors with ignore comments, and this makes the ban mechanical rather than a promise. One alternative was rejected: allowing disable comments that carry a mandatory `-- reason`. That keeps a per-line escape hatch, and those accumulate without anyone re-checking the reasons.

**One exception to removing prose: the agent-only git rules stay in `AGENTS.md`.** Those are: never skip the pre-commit hook, never commit to `main`, branch names, `CLAUDE(<type>): ` subjects, and no edits under `.agents/skills/`. Lint can't see them. They're enforced instead by a Claude Code `PreToolUse` hook and a lefthook `commit-msg` job, also in `@repo/conventions`. Claude Code hooks bind only Claude Code, and other agents read `AGENTS.md`, so the prose remains their only statement.
