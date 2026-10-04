# pvl

`PVL` (Precompiled Validation Library) is a schema-validation library that can compile schemas into optimized code (plain `if`/`for` statements) for fast runtime validation. It's a pnpm + Turborepo TypeScript monorepo: [`MONOREPO.md`](./MONOREPO.md) lists its workspace entries.

Requires Node 24 or newer and pnpm (the version is pinned in `package.json`'s `packageManager`). `pnpm install` also installs the lefthook git hooks.

## Commands

Run these from the repo root. Turborepo runs each one across the whole workspace.

| Command                             | What it does                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Watch/dev mode for every app and package                                                                          |
| `pnpm build`                        | Build every app and package                                                                                       |
| `pnpm test`                         | Every package's unit and integration suites                                                                       |
| `pnpm lint`                         | Lint every app and package                                                                                        |
| `pnpm check-types`                  | Type-check every app and package                                                                                  |
| `pnpm format` / `pnpm format:check` | Format with Prettier, or only check the formatting                                                                |
| `pnpm docs:dev` / `pnpm docs:build` | Generate the API reference, then serve or build the documentation site                                            |
| `pnpm claude [claude args]`         | Pick a git worktree (or create one) from a menu and start Claude Code there with `--dangerously-skip-permissions` |
| `pnpm claude-list`                  | Pick git worktrees from a menu and remove them, together with their branches                                      |

## Post-modification checklist

Every change has to pass all of these:

```bash
pnpm format        # auto-fixes; the rest must each exit zero
pnpm format:check
pnpm lint
pnpm check-types
pnpm test
pnpm build
```

lefthook's `pre-commit` hook ([`lefthook.yml`](./lefthook.yml)) runs `pnpm format` before every commit and re-adds its fixes to the commit. It then runs `lint`, `check-types`, `test` and `build`. Fix the root cause of a failure. Don't suppress it or skip the hook.
