# `stackblitz/`

Projects the docs site embeds as live StackBlitz windows, one folder each. [`get-started-docs/`](./get-started-docs/) is the window on the getting-started page. This file sits beside the projects, never inside one, because StackBlitz shows a project's whole folder to the reader ([ADR-0050](../docs/adr/0050-stackblitz-projects-live-outside-the-workspace-and-install-the-published-packages.md)).

## Rules

- **Each project is self-contained.** It isn't a pnpm workspace entry and depends on nothing under `@repo/*`, so StackBlitz's plain `npm install` works on the folder alone. Its `tsconfig.json` restates its options instead of extending `@repo/typescript-config`, which is why `lint:workspace` exempts `stackblitz/**` from `tsconfig-extends`. Every other `lint:workspace` rule still applies to its `package.json`, and it gets no ESLint config.
- **It installs the published packages**: `@pcvl/schema` and `@pcvl/compiler` at the `next` dist-tag, until `0.1.0` ships on `latest` ([releasing.md](../docs/agents/releasing.md#leaving-prerelease-mode)).
- **The docs load it straight from `main` on GitHub** (`https://stackblitz.com/github/Ota-Prokopec/pvl/tree/main/stackblitz/<project>`), so a change shows only once merged. Keep a project to API already released on `next`: CI checks it against the code about to be published, not against what's on npm.
- **StackBlitz runs the `dev` script** after installing, so `dev` compiles and runs the project: `validate` runs `src/index.ts`, and npm runs `prevalidate` (`pvl compile`) before it, a lifecycle hook instead of `run-s`, whose `npm-run-all` would add some 130 packages to the install. Its watcher watches only `src/`, since `pvl compile` writes `.pvl/` outside it.
- **Dependencies are only what the window runs.** The reader waits for StackBlitz to install every one, so the type check's `typescript` and `@types/node` are installed by [`stackblitz.sh`](../.github/tarball/stackblitz.sh), not listed in the project; the editor brings its own TypeScript.
- **Every file is written for the reader**: each starts with a comment saying what it's for (`package.json` and `pvlconfig.json` can't hold one), and nothing repo-internal goes in the folder.

## Commands

The tarball job in [`ci.yml`](../.github/workflows/ci.yml) installs the packed tarballs and TypeScript into a copy of `get-started-docs/`, then runs `npx pvl compile` and `tsc` ([`stackblitz.sh`](../.github/tarball/stackblitz.sh)). To try a project locally, copy it outside the repo and run `npm install`, then `npm run dev`.
