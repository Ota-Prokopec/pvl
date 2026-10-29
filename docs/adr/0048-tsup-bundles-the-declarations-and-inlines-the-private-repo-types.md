# tsup bundles the declarations and inlines the private `@repo/types`

**`@pcvl/schema` and `@pcvl/compiler` build their declarations with tsup 9's `dts`, in the same `tsup` run as the JavaScript, and `dts.resolve: ['@repo/types']` inlines the private `@repo/types` into them. `@repo/types` is a devDependency of both, so neither the tarball's manifest nor its declarations name it ([#197](https://github.com/Ota-Prokopec/pvl/issues/197)).**

- The separate `tsc --project tsconfig.build.json` step emitted per-file declarations that imported `@repo/types`, which isn't published, so a consumer's type-check failed on every import of either package.
- tsup 8.5.1's declaration build failed under TypeScript 6 on the `baseUrl` it injects. tsup 9 builds them, so the step was moved into tsup, and `tsconfig.build.json` and the `build:types` script are gone.
- tsup's declaration resolver reads only a package's `types` (or `typings`) field and can't follow a `.js`-suffixed relative re-export to its `.ts` source. So `@repo/types` declares `"types": "./src/types.ts"` and keeps its types in one file, `src/types.ts`, with no barrel. Without either, the import stays in the output, which is why an earlier spike with `noExternal` and `dts.resolve` alone still emitted it.
- tsup writes `index.d.ts` for ESM and `index.d.cts` for CJS, and each `exports` condition points at its own, so the CJS types no longer claim to be ESM.

## Consequences

- This updates [ADR-0004](./0004-dual-esm-cjs-publish-via-tsup.md)'s declarations: one `tsup` run emits both formats and their matching declarations.
- CI's `tarball` job proves the declarations are self-contained: it installs the packed tarballs into a project outside the workspace, where no `@repo/*` resolves, and type-checks against them. A leaked import fails it with TS2307. It also runs `publint` and `@arethetypeswrong/cli` on both packages and imports each as ESM and CJS.
- A new type in `@repo/types` that a package's public declarations reach goes into `src/types.ts`, which `exports` and `types` point at directly, not into a module a barrel re-exports.

## Considered options

- **Move `ValueOfEnum` into `@pcvl/schema` and delete `@repo/types`** (the ticket's fallback). Rejected once inlining worked: it would make a repo-wide utility part of the published API surface, and the compiler and benchmark would import a private helper from a published package.
- **Keep `tsc` for the declarations and rewrite their imports afterwards.** Rejected: a bespoke post-processing step, where tsup already bundles declarations.
