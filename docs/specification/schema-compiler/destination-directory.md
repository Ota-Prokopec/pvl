# The Destination Directory

What `@pvl/schema-compiler` writes and where. Read this before you change the compiler's output, its layout, or where it lands.

## One `Destination Directory`, and nothing else is ever rewritten

The compiler writes a single **`Destination Directory`** and modifies nothing else — not the developer's tracked source, not their build output, in any mode. There is no `production` flag. See [ADR-0005](../../adr/0005-compiler-emits-a-destination-directory-and-rewrites-nothing.md).

## A complete mirror of the source root

The `Destination Directory` is a **complete mirror** of the scanned set. Every file `include` matches is mirrored, with or without a `pvl.compile(...)` call, to `<destination>/<its path relative to rootDir>`: with the default `rootDir` of `src`, `src/schemas/user.ts` becomes `<destination>/schemas/user.ts`. A scanned file outside `rootDir` has no place in the mirror, so it is the `FILE_OUTSIDE_ROOT_DIR` error. `@pvl/schema` stays a runtime dependency of the mirror, which carries ordinary interpreted schemas too, though a Compiled Schema imports only its types ([ADR-0029](../../adr/0029-a-compiled-schema-is-a-class-expression-implementing-the-schema-type.md)).

Each mirrored module is its source's code under a `@generated` header, with each `pvl.compile(...)` call replaced by its Compiled Schema ([code-generation.md](./code-generation.md#each-compiled-schema-is-a-class-expression-implementing-schema)), a Runtime Argument in a `const` such a call follows hoisted (below), and module specifiers rewritten so they resolve from the new location (resolved the way a bundler would, so `./user.js` finds `user.ts`). Nothing else changes: a mirrored module exports exactly what its source exports, its declared types included, and adds no export of its own ([ADR-0046](../../adr/0046-a-mirrored-module-exports-exactly-what-its-source-exports.md)). The mirror holds no file the source lacks: with no `<rootDir>/index.ts`, it has no `index.ts`, and one the application wrote is mirrored like any other scanned file. A default export (`export default`, `export =`, `export { x as default }`) is mirrored as written, a `pvl.compile(...)` in it compiled, but is the `DEFAULT_EXPORT` warning, one per statement, in any scanned file and whatever it exports. Module specifiers are rewritten as follows:

- **A relative import of a scanned file** stays as written: the layout is the same, so it already reaches the mirrored file.
- **A relative import of anything else** (an unscanned helper, a `.json` file) is rewritten to reach the original file from the mirrored module's directory.
- **An absolute-path import** (`/repo/src/lib/helpers.js`) is rewritten to a relative path: to the mirrored module, keeping its extension spelling, when it names a scanned file; to the original file otherwise, as written, even when nothing is there.
- **An alias import** (`@/schemas/user`), resolved through the `paths` of `<baseDirectory>/tsconfig.json` (and whatever it extends) when it exists, is rewritten to a relative path: to the mirrored module when it names a scanned file, to the original file otherwise. Left as an alias, it would load the original from inside the mirror. A tsconfig that can't be read or parsed, or whose `extends` names a file that can't, is the `TSCONFIG_UNREADABLE` error, since mirroring without its `paths` would quietly leave every alias pointing at the originals.
- **A package import** (`@pvl/schema`) is kept, even when tsconfig `paths` also maps it, as a workspace often maps its own packages: a bare module specifier that `node_modules` resolves is a package.

Import and export declarations, a dynamic `import()`, an `import x = require()` and an `import('…')` type all follow these rules; a computed `import()` is left alone.

A Runtime Argument written in a top-level `const` that a `pvl.compile(...)` call follows, outside the call, is hoisted, so it still runs once, where it is written ([ADR-0030](../../adr/0030-a-method-argument-the-compiler-cant-read-is-a-runtime-argument-evaluated-once-where-it-is-written.md)). Its value goes into a `const pvlArg<n>`, a name the module doesn't use, right before the `const`'s declarator, which then reads it, and every call it reaches passes that name. A declarator after the first of its statement is split off into a statement of its own, keeping the statement's keywords:

```ts
export const first = 1,
  base = pvl.string().max(getMax());
// ↓
export const first = 1;
const pvlArg0 = getMax();
export const base = pvl.string().max(pvlArg0);
```

### Writing it

Output is byte-stable across runs with unchanged input. The compiler marks every Destination Directory it writes with a `.pvl-generated` file, and only ever replaces a directory that is absent, empty or carries that marker; anything else is the `DESTINATION_NOT_EMPTY` error, so a `destination` pointed at real source can't be wiped. The mirror is written to a temporary sibling directory (`<destination>.pvl-tmp`) first. The previous directory is then renamed aside to `<destination>.pvl-old`, the new one renamed into place, and only then is the old one removed; a failure at any step puts the old one back. So a run either replaces the whole directory or leaves it as it was. Both sibling directories are never scanned, and a later run replaces any a crashed run left behind.

## Adopting it

The mirror has the source's layout, so an application swaps an alias rather than its imports ([ADR-0005](../../adr/0005-compiler-emits-a-destination-directory-and-rewrites-nothing.md)): it imports its schemas through an alias and, for production, points it at the Destination Directory. A tsconfig `paths` fallback overlays the mirror on the source, taking a mirrored module where one exists and `src` for everything else:

```jsonc
// production
"paths": { "@/*": ["./.pvl/*", "./src/*"] }
// development
"paths": { "@/*": ["./src/*"] }
```

A bundler alias works the same way. No alias can redirect a relative import (`'./schemas/user.js'`), so a schema imported that way keeps loading its source. A bundler plugin that redirects resolution of every scanned file, relative imports included, in production builds only, is the planned way around that.

Development runs the Interpreted Schemas, so there is no watch mode ([ADR-0045](../../adr/0045-there-is-no-watch-mode-because-development-runs-the-interpreted-schemas.md)): `pvl compile` is a build step, wired in ahead of the build so production always ships a fresh mirror:

```jsonc
"scripts": { "build": "pvl compile && tsc" }
```

CI runs `pvl compile`, then the typecheck and tests under the production alias, so the compiled code that ships is tested.

## Where it lands

[ADR-0015](../../adr/0015-compiled-schema-destination-resolution.md) decides it. With `destination` unset, it goes to `<baseDirectory>/.pvl/`, which also gets a `.gitignore` of `*` so it stays out of version control. With `destination` set, it goes there and nothing is added for git. Either way it is plain TypeScript and the consuming build owns compilation. `<baseDirectory>` is the directory holding `pvlconfig.json` (or the working directory for a flags-only run), which is what keeps two applications in one workspace from overwriting each other. Read that ADR before proposing to put the output in `node_modules` or expose it through `@pvl/schema`'s own `exports`.
