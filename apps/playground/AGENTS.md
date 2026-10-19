# `playground`

A private scratch app for watching [`@pvl/schema-compiler`](../../packages/schema-compiler/AGENTS.md) work. `src/schemas/user.ts` holds one Schema marked with `pvl.compile(...)`; `pvl compile` mirrors it into `.pvl/` (git-ignored) with the Schema compiled to straight-line code; `src/index.ts` validates a passing and a failing value against the compiled one and prints the result. Edit the Schema, re-run, read `.pvl/schemas/user.ts`. Nothing asserts on the output.

## Build first

`start` and `check-types` need `@pvl/schema` and `@pvl/schema-compiler` built (`pnpm build` at the root), since the `pvl` bin is `packages/schema-compiler/dist/bin.js`.

## Commands

- `pnpm --filter playground compile`: run `pvl compile` only.
- `pnpm --filter playground start`: compile, then run `src/index.ts`.

## Rules

- The package stays `private` under the bare name `playground`.
- No tests, by decision: the output is a scratch surface.
