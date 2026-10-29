# StackBlitz projects live outside the workspace and install the published packages

**The docs' StackBlitz windows load plain npm projects from `stackblitz/<project>/` on `main` on GitHub. They aren't pnpm workspace entries, use none of the repo's internal tooling, and install `@pcvl/schema` and `@pcvl/compiler` from npm ([#206](https://github.com/Ota-Prokopec/pvl/issues/206)).**

- StackBlitz runs a plain `npm install` on the project folder alone. npm fails on the `workspace:` protocol (`EUNSUPPORTEDPROTOCOL`) and on any `@repo/*` package (`E404`, as they're private), even with `--omit=dev`, tested with npm 11. So a project can't take `@repo/typescript-config`, `@repo/eslint-config` or a `workspace:*` link.
- Loading from GitHub needs no StackBlitz SDK, docs build step or separately hosted copy: the docs page holds a plain `<iframe>`, and the project is reviewed and versioned like any other code.
- Installing from npm means the window runs exactly what a reader would install.

## Consequences

- The project asks for the `next` dist-tag while PVL is in prerelease, and switches to `latest` when `0.1.0` ships ([releasing.md](../agents/releasing.md#leaving-prerelease-mode)).
- `lint:workspace` exempts `stackblitz/**` from `tsconfig-extends`; its other rules still check the project's `package.json`.
- CI's tarball job installs the packed tarballs into a copy of the project and runs its `check-types`, so a change that would break the window fails its PR. It checks the code about to be published, not the `next` already on npm, so the project keeps to released API.
- A docs preview or `docs:dev` shows `main`'s project, not the branch's.

## Considered options

- **Make each project a workspace entry with the repo's presets.** Rejected: StackBlitz's `npm install` fails on `workspace:` and `@repo/*`.
- **Embed through the StackBlitz SDK, building the project's files into the docs site.** Rejected: a build step and a dependency for what a GitHub URL already does.
