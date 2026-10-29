# Releases are fixed Changesets prereleases, published from the `release` branch by trusted publishing

**`@pcvl/schema` and `@pcvl/compiler` are versioned by Changesets in fixed mode, so they always share one version, and stay in prerelease mode `next` (`0.1.0-next.N` on the `next` dist-tag) until the compiler compiles every Schema `@pcvl/schema` offers. A version bump is a `pnpm changeset version` PR into `main`; a publish is the maintainer fast-forwarding the protected `release` branch to a `main` commit. `.github/workflows/release.yml` then publishes every package whose version isn't on npm yet through npm trusted publishing (OIDC) with provenance, and tags the commit `vX.Y.Z` with a GitHub Release of that version's changelog ([#194](https://github.com/Ota-Prokopec/pvl/issues/194)).**

- Fixed versions make "use compiler X.Y with schema X.Y" the only compatibility rule: the code the compiler generates imports its types from the schema package. The compiler's `workspace:*` peer dependency on the schema package publishes as that exact version, so npm enforces it.
- A `-next.N` prerelease keeps `0.1.0` for the first release whose compiler is complete.
- Releasing from `release`, rather than from every `main` merge, lets the maintainer decide when a version goes out, while every release is still a commit `main` has. A push whose version is already on npm and released is a no-op, so pushing, and re-running a failed run, is always safe.
- Trusted publishing leaves no long-lived npm token in the repo's secrets, and gives each version a provenance attestation tying it to this repo's workflow.

## Consequences

- The workflow publishes with `pnpm -r publish`, which skips a version already on npm, publishes the schema package before the compiler that peers on it, rewrites the `workspace:` ranges, and does the OIDC token exchange itself (the pinned pnpm 11.25), so npm trusted publishing's npm CLI 11.5.1 minimum doesn't apply. The dist-tag is the version's prerelease identifier (`next` for `0.1.0-next.1`), or `latest` for a stable version.
- It creates the tag and the GitHub Release through `gh release create` in the same job, unless that release already exists, because a tag pushed with `GITHUB_TOKEN` starts no other workflow. The notes are each package's `CHANGELOG.md` section for the version.
- Trusted publishing is configured per package on npmjs.com and needs the package to exist, so each package's first version is published by hand. npm puts a new package's first version on `latest` too, so `latest` points at that hand-published prerelease until `0.1.0`.
- [`docs/agents/releasing.md`](../agents/releasing.md) holds the steps and the rule for leaving prerelease mode; [`git-workflow.md`](../agents/git-workflow.md) keeps `release` out of the `<type>/<slug>` rule and out of agents' hands.

## Considered options

- **`changeset publish`** ([#194](https://github.com/Ota-Prokopec/pvl/issues/194)'s choice). Rejected: in prerelease mode it publishes a package whose every version is a prerelease on `latest` rather than `next` ("only-pre" in `@changesets/cli` 3's publish plan), which is every release here until `0.1.0`, so `npm install @pcvl/schema@next` would stay on the first version; and it refuses `--tag` in prerelease mode. `pnpm -r publish` with the tag taken from the version does the rest of its job.
- **Publishing on every merge to `main`** (the Changesets action's version PR flow). Rejected: the maintainer wants to choose the moment, and a bot PR adds a second way versions change.
- **An npm automation token in the repo's secrets.** Rejected: a long-lived credential that trusted publishing makes unnecessary.
- **`npm publish` per package.** Unneeded: it is the fallback for a `pnpm publish` without OIDC support, and pnpm 11.25 has it.
