# Releasing

How `@pcvl/schema` and `@pcvl/compiler` get a new version and reach npm ([ADR-0049](../adr/0049-releases-are-fixed-changesets-prereleases-published-from-the-release-branch-by-trusted-publishing.md)). Changesets keeps both on one version, in prerelease mode `next` (`0.1.0-next.N` on the `next` dist-tag). An agent prepares the version PR; publishing is the maintainer's push.

## Release steps

1. **Version PR.** On a `chore/<slug>` branch off `main`, run `pnpm changeset version`. It consumes the pending `.changeset/*.md` files, bumps both packages to the next version and writes each package's `CHANGELOG.md`. Commit it and open a PR into `main`; the maintainer merges it. Done when the PR is open.
2. **Publish (maintainer only).** With `main` at the merged version commit, `git push origin main:release` fast-forwards `release`. [`release.yml`](../../.github/workflows/release.yml) builds both packages, publishes each version that isn't on npm yet through trusted publishing with provenance, and creates the `vX.Y.Z` tag and a GitHub Release of that version's changelog, a prerelease for `-next.N`. A push whose version is already on npm does nothing.

A run that publishes and then fails before the GitHub Release can't be fixed by a re-run, which finds nothing to publish: the maintainer creates the release by hand with `gh release create vX.Y.Z --target <commit> --prerelease --notes-file <the changelog sections>`.

## One-time setup (maintainer)

1. Create `release` from `main` and protect it: only the maintainer may push, force pushes and deletion blocked.
2. Publish each package's first version by hand, since trusted publishing can only be configured for a package that exists. The first `pnpm changeset version` must yield `0.1.0-next.0`, so the pending changesets bump `minor` (a `patch` gives `0.0.1-next.0`). After that version PR merges, on `main` and logged in to npm: `pnpm build`, then `pnpm -r publish --tag next`. npm also puts a package's first version on `latest`, which stays there until `0.1.0`.
3. On npmjs.com, in each package's settings, add a GitHub Actions trusted publisher: owner `Ota-Prokopec`, repository `pvl`, workflow `release.yml`, no environment.

## Leaving prerelease mode

When the compiler compiles every Schema `@pcvl/schema` offers, run `pnpm changeset pre exit` in a version PR together with `pnpm changeset version`: it versions both packages `0.1.0`, which the next push to `release` publishes on `latest`. Until then, every release stays a `0.1.0-next.N` prerelease.
