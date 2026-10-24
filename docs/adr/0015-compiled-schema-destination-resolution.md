# The Destination Directory defaults to `<baseDirectory>/.pvl/`

`pvlconfig.json`'s `destination` is optional. When it is unset, `@pvl/schema-compiler` writes its [Destination Directory](../../GLOSSARY.md) to `<baseDirectory>/.pvl/`, and puts a `.gitignore` of `*` inside it so the output stays out of version control with no change to the application. When `destination` is set, the Destination Directory goes there, and committing it is the developer's choice. Either way the output is plain TypeScript (`.ts` mirrored modules and an `index.ts` barrel) with no build step: the consuming build already owns compilation for the rest of its source, and owns this too. `@pvl/schema` stays an ordinary import, so the application resolves exactly one copy of the library.

`<baseDirectory>` is the directory containing `pvlconfig.json`, or the working directory for a flags-only run; when no base directory can be determined the compiler errors rather than guessing. Resolving from the config file's directory is what makes a monorepo behave: two applications compiling different Schema sets each write under their own directory instead of racing for one shared output.

A project folder fits how the mirror is adopted ([ADR-0005](./0005-compiler-emits-a-destination-directory-and-rewrites-nothing.md)): the application points an alias at the Destination Directory, so it needs no package name of its own.

## Rejected for now: a `node_modules` package of plain TypeScript

This record first put the default at `<baseDirectory>/node_modules/.pvl/compiled-schemas/` behind an `@pvl/compiled-schemas` symlink, so a bare specifier reached the output with no change to `tsconfig.json`, the bundler config or `package.json`. Once the output is plain `.ts`, that location breaks most toolchains: Node refuses to strip types from a file under `node_modules`, and many builds (`tsc` then Node, Next.js without `transpilePackages`) don't transpile dependencies. Building the mirror with tsup into `.js`, `.cjs` and `.d.ts` there would make it work everywhere; [#118](https://github.com/Ota-Prokopec/pvl/issues/118) tracks that, and the reasoning below is what it rests on.

The dot-directory plus symlink arrangement looks odd and is deliberate; both halves were verified experimentally rather than assumed. A dot-prefixed directory survives `pnpm install`, which prunes packages absent from the lockfile but leaves `.bin`, `.pnpm` and their siblings alone — so a routine dependency change does not silently delete the developer's compiled output. A dot-prefixed directory is also not a usable package name, which is what the symlink fixes: `@pvl/compiled-schemas` is a valid name, so a bare specifier resolves through it to the real directory.

**The obvious alternative — exposing the output through `@pvl/schema`'s own `exports` — cannot work, and this is the part that must survive.** Anyone revisiting this will propose it again. Three independent Node resolution rules each rule it out on their own:

1. A package name may not begin with `.`, so the dot-directory can never be addressed as a package.
2. An `exports` (or `imports`) target may not escape its own package, so `@pvl/schema` cannot point at a path inside the consuming application.
3. Any `exports`/`imports` target containing a `node_modules` path segment is rejected outright, so even a same-package path that routes through `node_modules` is invalid.

A re-export shim placed inside `@pvl/schema` fails for a different and equally fatal reason: module resolution runs from the location of the file doing the importing. A shim living in `@pvl/schema` resolves from that package's own directory, which in a pnpm workspace is the hoisted copy at the workspace root — so it reaches the root's `node_modules`, never the consuming application's. Concretely, `apps/*/node_modules/@pvl/schema` is a symlink to the tracked `packages/schema` source directory and is shared by every application in the workspace, so a shim there would resolve to the same output for all of them, which is exactly the collision the per-application base directory exists to prevent.

The accepted cost of the `node_modules` package, once built: the compiler writes into `node_modules`, which some build pipelines treat as read-only (those consumers set `destination` explicitly, which is why the option exists), and the path depends on symlink support, which is fine on every platform pnpm itself already requires.
