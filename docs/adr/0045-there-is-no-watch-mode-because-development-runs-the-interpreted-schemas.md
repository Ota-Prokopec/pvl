# There is no watch mode, because development runs the Interpreted Schemas

**`pvl compile` has no watch mode, and `watch` is neither a `pvlconfig.json` key nor a flag. Development runs the Interpreted Schemas, so nothing in development reads the mirror ([#55](https://github.com/Ota-Prokopec/pvl/issues/55)).**

- Development points the alias at the source, so a recompile on save would write a mirror nothing loads ([ADR-0005](./0005-compiler-emits-a-destination-directory-and-rewrites-nothing.md)).
- The cost, measured on 2026-10-28 on `apps/benchmark`'s single 204-line schema file:
  - a cold `pvl compile` takes about 1.2 s, of which about 0.2 s is CLI startup;
  - each `runCompilation` takes about 0.65–0.9 s even in a process that's already running, because every run rebuilds the project;
  - it grows with the scanned set, while the Interpreted Schemas need no step at all.

## Consequences

- `pvl compile` is a build and CI step.
- CI runs `pvl compile`, then the typecheck and tests under the production alias, so the compiled code that ships is tested.
- The planned bundler plugin redirects only in production builds, and the dev server serves the Interpreted Schemas.
- `"watch"` in `pvlconfig.json` and `--watch` fail like any other unknown key or flag, so a stale config or script fails loudly.
