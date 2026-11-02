# `@repo/utils`

Runtime helpers that aren't specific to the domain. It is a private package with no build: `exports` points at `src/index.ts`, which re-exports one file per helper.

## Scope

A helper function belongs here if the purpose of the function is not domain specific.

## Commands

- `pnpm --filter @repo/utils test`: the Vitest suite in `tests/`.
