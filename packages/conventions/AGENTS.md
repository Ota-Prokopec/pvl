# `@repo/conventions`

The repo's conventions as code: the custom ESLint rules (`@repo/conventions/eslint`). A private package with no build. ESLint loads the TypeScript source through jiti. [`@repo/eslint-config`](../eslint-config/AGENTS.md) decides which files each rule runs on. [ADR-0022](../../docs/adr/0022-conventions-enforced-by-lint-not-restated-in-prose.md) records why conventions live here.

## Writing a rule

- **A rule's `meta.docs.description` and its messages are the only statement of the convention.** Once a rule enforces something, delete its prose from the `.md` files. Word each message as the instruction to follow, not as a description of the problem.
- **Build an exception into the rule's own logic** (the `interface` that uses polymorphic `this`, the import alias that avoids a clash) or set it as a file-scoped override in the ESLint config. Inline disable comments do nothing (`noInlineConfig`).
- TypeScript-source rules use `createRule` from `src/eslint/utils.ts` (typescript-eslint's `RuleCreator`). `package.json`/`tsconfig*.json` rules are `@eslint/json` rule definitions and `AGENTS.md` rules are `@eslint/markdown` ones.
- Register each rule in `src/eslint/plugin.ts`, then enable it in `@repo/eslint-config`: `src/base.ts` for TypeScript source, `src/workspace.ts` for the root `lint:workspace` task.
- **Every rule has a test in `tests/` with at least one valid and one invalid case per message.** Rules that read the file system (barrel siblings, `.env*` files, `AGENTS.md` presence) get their fixtures from `createFixture` in a temporary directory.

## Wiring quirks

- `@repo/eslint-config` depends on this package, so this package's own `eslint.config.ts` imports that preset by relative path. Declaring it as a dependency would be a workspace cycle, and Turborepo rejects those.
- The plugin is exported under typescript-eslint's opaque `CompatiblePlugin` type. typescript-eslint's rule types and ESLint's config types don't line up, and that type is the one both accept.
- Relative imports name the `.ts` file (`allowImportingTsExtensions`), and only erasable syntax is allowed, because jiti and Node's type stripping both load this source directly.
