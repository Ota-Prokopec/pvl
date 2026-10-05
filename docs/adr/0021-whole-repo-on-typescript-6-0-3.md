# The whole repo runs on TypeScript 6.0.3

Enforcing the repo's conventions with ESLint ([ADR-0022](./0022-conventions-enforced-by-lint-not-restated-in-prose.md)) needs typescript-eslint. Its newest release (8.71.0) declares `peerDependencies.typescript: ">=4.8.4 <6.1.0"`, and the TypeScript 7.0.2 the repo had pinned can't satisfy it in practice. 7.0 is the native rewrite, and its npm package exports only `./lib/version.cjs` and `./unstable/sync`, with no compiler API for a parser to call. TypeDoc 0.28.20, which generates `apps/docs`' API reference, accepts `6.0.x` too. So **6.0.3**, the newest TypeScript both tools accept (there is no 6.1.0), is now pinned exactly in every workspace entry, `apps/docs` included. The repo is back on one compiler.

This supersedes [ADR-0014](./0014-typedoc-pinned-to-typescript-5-9.md). Its reasoning stops applying once 6.0.x is stable: TypeDoc no longer needs a compiler different from the rest of the repo, so `apps/docs` drops its own `~5.9.3` pin.

Three alternatives were rejected:

- **Keep 7.0.2 for the build and isolate 6.0.3 in the lint package only**, the way ADR-0014 isolated 5.9. Lint would then parse every source file with a different compiler from the one that builds it. ADR-0014 recorded exactly that risk for one package, and this would spread it to the whole repo.
- **Keep the Babel parser.** typescript-eslint's rules would be unavailable, so every TypeScript rule would have to be hand-written against Babel's AST. That's the bespoke tooling the root `AGENTS.md` asks us not to build.
- **Switch to oxlint or Biome.** That adds a second toolchain beside ESLint without solving anything ESLint can't.

The cost is TypeScript 7's native-compiler speed in `check-types` and `build`.

**Revisit when typescript-eslint and TypeDoc both accept TypeScript 7.**
