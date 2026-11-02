# `@repo/utils`

Runtime helpers that aren't specific to the domain, such as `pluralize`, which `@pcvl/compiler`'s `pvl compile` output uses. It is a private package with no build: `exports` points at `src/index.ts`, which re-exports one file per helper.

`@pcvl/compiler` takes it as a devDependency, and its tsup build bundles it into the published code ([`private-packages.md`](../../docs/specification/private-packages.md)).

## Scope

A helper belongs here when more CLI output and scripts could need it (now, or in the future) and it isn't specific to the domain. `pluralize` qualifies on both counts. Domain logic stays in its package.

## Commands

- `pnpm --filter @repo/utils test`: the Vitest suite in `tests/`.
