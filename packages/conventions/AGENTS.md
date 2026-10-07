# `@repo/conventions`

The repo's conventions as code: the custom ESLint rules (`@repo/conventions/eslint`) and the git hooks (`src/hooks/`) for the rules lint can't see. A private package with no build. ESLint loads the TypeScript source through jiti, and Node runs the hook scripts directly by stripping their types. [`@repo/eslint-config`](../eslint-config/AGENTS.md) decides which files each rule runs on. [ADR-0022](../../docs/adr/0022-conventions-enforced-by-lint-not-restated-in-prose.md) records why conventions live here.

## Writing a rule

- **A rule's `meta.docs.description` and its messages are the only statement of the convention.** Once a rule enforces something, delete its prose from the `.md` files. Word each message as the instruction to follow, not as a description of the problem.
- **Build an exception into the rule's own logic** (the `interface` that uses polymorphic `this`, the import alias that avoids a clash) or set it as a file-scoped override in the ESLint config. Inline disable comments do nothing (`noInlineConfig`).
- TypeScript-source rules use `createRule` from `src/eslint/utils.ts` (typescript-eslint's `RuleCreator`). `package.json`/`tsconfig*.json` rules are `@eslint/json` rule definitions and `AGENTS.md` rules are `@eslint/markdown` ones.
- Register each rule in `src/eslint/plugin.ts`, then enable it in `@repo/eslint-config`: `src/base.ts` for TypeScript source, `src/workspace.ts` for the root `lint:workspace` task.
- **Every rule has a test in `tests/` with at least one valid and one invalid case per message.** Rules that read the file system (barrel siblings, `.env*` files, `AGENTS.md` presence) get their fixtures from `createFixture` in a temporary directory.

## Hooks

Each hook script is a thin entry that reads its input and calls a pure `check*` function, which returns every broken rule as the instruction to follow. Tests call the `check*` functions directly.

| Script                   | Runs as                                                        | Denies                                                                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/hooks/guardBash.ts` | Claude Code `PreToolUse` on `Bash` (`.claude/settings.json`)   | skipping the pre-commit hook; committing on or pushing to `main`; committing or pushing from a branch that isn't `<type>/<slug>`; `gh pr merge`; a non-conventional `gh` PR/issue title; a Claude mention in anything posted with `gh` |
| `src/hooks/guardEdit.ts` | Claude Code `PreToolUse` on `Edit`, `Write` and `NotebookEdit` | editing a skill `skills-lock.json` lists (under `.agents/skills/` or `.claude/skills/`), or any skill when the lock file can't be read; writing to Claude Code's memory directory                                                      |
| `src/hooks/commitMsg.ts` | lefthook `commit-msg` (`lefthook.yml`)                         | a commit subject that isn't `<type>(<scope>): <description>`, for every commit, human ones included. Git's own merge, revert and autosquash subjects pass                                                                              |

`guardBash` follows `cd`, `git -C`, and a `git checkout -b`/`switch -c`/`branch -m` earlier in the same command, so it checks the branch the commit actually lands on. It can't see through scripts, aliases or `eval`. The hooks back up [`docs/agents/git-workflow.md`](../../docs/agents/git-workflow.md), which stays the full statement of these rules, because agents other than Claude Code aren't bound by them.

A hook script can't run in a checkout that hasn't had `pnpm install`, because `shell-quote` resolves from this package's `node_modules`. Claude Code then reports a hook error and lets the call through.

## Wiring quirks

- `@repo/eslint-config` depends on this package, so this package's own `eslint.config.ts` imports that preset by relative path. Declaring it as a dependency would be a workspace cycle, and Turborepo rejects those.
- The plugin is exported under typescript-eslint's opaque `CompatiblePlugin` type. typescript-eslint's rule types and ESLint's config types don't line up, and that type is the one both accept.
- Relative imports name the `.ts` file (`allowImportingTsExtensions`), and only erasable syntax is allowed, because jiti and Node's type stripping both load this source directly.
