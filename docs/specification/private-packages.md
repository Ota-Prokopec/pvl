# Private packages

How a published package (`@pcvl/schema`, `@pcvl/compiler`) uses a private workspace package (`@repo/*`): only as a `devDependency`, with its code bundled into what is published.

## How npm installs a package's dependencies

Installing a project installs its own `dependencies` and `devDependencies`. For every package pulled in, npm then installs that package's `dependencies` (and `peerDependencies`), never its `devDependencies`: those serve whoever develops the package (building, linting, testing), not whoever uses it.

`pnpm publish` rewrites each `workspace:*` range to the version it points at. A private `@repo/*` package listed in a published package's `dependencies` would therefore reach npm as `"@repo/utils": "0.0.0"`. Every `npm install @pcvl/compiler` would then look it up on the registry and fail with a 404, or install whatever someone else published under the `@repo` scope.

## The rule

A published package takes a private `@repo/*` package as a `devDependency` only. npm never installs it for a user, so the published package must not need it at run time. Instead, its build ships it:

- **Code**: tsup bundles every import that isn't in `dependencies` or `peerDependencies`, so a `devDependency`'s code is inlined into `dist` (e.g. `pluralize` from `@repo/utils`).
- **Types**: when the private package's types reach the published declarations, `dts.resolve` inlines them, as for `@repo/types` ([ADR-0048](../adr/0048-tsup-bundles-the-declarations-and-inlines-the-private-repo-types.md)).
