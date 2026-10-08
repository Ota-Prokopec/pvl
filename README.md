# pvl

![PVL, the Precompiled Validation Library](./assets/banner.jpeg)

`PVL` (Precompiled Validation Library) is a schema-validation library that can compile schemas into optimized code (plain `if`/`for` statements) for fast runtime validation. It's a pnpm + Turborepo TypeScript monorepo: [`MONOREPO.md`](./MONOREPO.md) lists its workspace entries.

Requires Node 24 or newer and pnpm (the version is pinned in `package.json`'s `packageManager`). `pnpm install` also installs the lefthook git hooks.

## Commands

Run these from the repo root. Turborepo runs each one across the whole workspace.

| Command                             | What it does                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Watch/dev mode for every app and package                                                                          |
| `pnpm build`                        | Build every app and package                                                                                       |
| `pnpm test`                         | Every package's unit and integration suites                                                                       |
| `pnpm lint`                         | Lint every app and package, plus the workspace-wide checks (`lint:workspace`)                                     |
| `pnpm check-types`                  | Type-check every app and package                                                                                  |
| `pnpm format` / `pnpm format:check` | Format with Prettier, or only check the formatting                                                                |
| `pnpm docs:dev` / `pnpm docs:build` | Generate the API reference, then serve or build the documentation site                                            |
| `pnpm build:thesis`                 | Build the thesis PDF and website into `apps/thesis-web/site/` (needs TeX and the GT America font)                 |
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

lefthook's `pre-commit` hook ([`lefthook.yml`](./lefthook.yml)) runs `pnpm format` before every commit and re-adds its fixes to the commit. It then runs `lint` and `check-types`. It doesn't run `test` or `build`; CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) runs those on every pull request, so run them yourself before calling a change done.

When you touch `thesis/` or `apps/thesis-web/`, also run `pnpm build:thesis` and commit the regenerated `apps/thesis-web/site/` ([`apps/thesis-web/AGENTS.md`](./apps/thesis-web/AGENTS.md)).
