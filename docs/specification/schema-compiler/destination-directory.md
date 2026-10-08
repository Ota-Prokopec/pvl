# The Destination Directory

What `@pvl/schema-compiler` writes and where. Read this before you change the compiler's output, its layout, or where it lands.

## One `Destination Directory`, and nothing else is ever rewritten

The compiler writes a single **`Destination Directory`** and modifies nothing else — not the developer's tracked source, not their build output, in any mode. There is no `production` flag. See [ADR-0005](../../adr/0005-compiler-emits-a-destination-directory-and-rewrites-nothing.md).

## A complete mirror of the source root

The `Destination Directory` is a **complete mirror** of the scanned set. Every file `include` matches is mirrored, with or without a `pvl.compile(...)` call, to `<destination>/<its path relative to rootDir>`: with the default `rootDir` of `src`, `src/schemas/user.ts` becomes `<destination>/schemas/user.ts`. A scanned file outside `rootDir` has no place in the mirror, so it is the `FILE_OUTSIDE_ROOT_DIR` error. `@pvl/schema` stays a runtime dependency of the mirror: every Compiled Schema extends its `Schema` class, and the mirror carries ordinary interpreted schemas too.

Each mirrored module is its source's code under a `@generated` header, with only module specifiers rewritten so they resolve from the new location (resolved the way a bundler would, so `./user.js` finds `user.ts`):

- **A relative import of a scanned file** stays as written: the layout is the same, so it already reaches the mirrored file.
- **A relative import of anything else** (an unscanned helper, a `.json` file) is rewritten to reach the original file from the mirrored module's directory.
- **An alias import** (`@/schemas/user`), resolved through the `paths` of `<baseDirectory>/tsconfig.json` when it exists, is rewritten to a relative path: to the mirrored module when it names a scanned file, to the original file otherwise. Left as an alias, it would load the original from inside the mirror.
- **A package import** (`@pvl/schema`) is kept.

Import and export declarations, a dynamic `import()`, an `import x = require()` and an `import('…')` type all follow these rules; a computed `import()` is left alone.

A default export would have no name in the barrel and a different import shape from every other mirrored export, so `export default`, `export =` and `export { x as default }` are the `DEFAULT_EXPORT` error: export it by name.

### The barrel

`<destination>/index.ts` re-exports every mirrored module that exports something (`export * from './schemas/user.js';`, sorted by path), so `from '<destination>'` imports everything at once. Two scanned files exporting the same name bound to different things would make the barrel's export ambiguous, so that is the `DUPLICATE_EXPORT` error. A re-export of the same binding under the same name isn't a clash. When `<rootDir>/index.ts` is itself scanned, it already sits where the barrel goes, so it is mirrored as the barrel, nothing is generated, and `DUPLICATE_EXPORT` isn't checked: TypeScript reports clashes in a hand-written barrel. The barrel only exists in the mirror, so an import of it has no development counterpart unless the application wrote its own `<rootDir>/index.ts`.

### Writing it

Output is byte-stable across runs with unchanged input. The compiler marks every Destination Directory it writes with a `.pvl-generated` file, and only ever replaces a directory that is absent, empty or carries that marker; anything else is the `DESTINATION_NOT_EMPTY` error, so a `destination` pointed at real source can't be wiped. The mirror is written to a temporary sibling directory first and moved into place, so a run either replaces the whole directory or leaves it as it was.

## Adopting it

The mirror has the source's layout, so an application swaps an alias rather than its imports ([ADR-0005](../../adr/0005-compiler-emits-a-destination-directory-and-rewrites-nothing.md)): it imports its schemas through an alias and, for production, points it at the Destination Directory. A tsconfig `paths` fallback overlays the mirror on the source, taking a mirrored module where one exists and `src` for everything else:

```jsonc
// production
"paths": { "@/*": ["./.pvl/*", "./src/*"] }
// development
"paths": { "@/*": ["./src/*"] }
```

A bundler alias works the same way. No alias can redirect a relative import (`'./schemas/user.js'`), so a schema imported that way keeps loading its source. A bundler plugin that redirects resolution of every scanned file, relative imports included, is the planned way around that.

## Where it lands

[ADR-0015](../../adr/0015-compiled-schema-destination-resolution.md) decides it. With `destination` unset, it goes to `<baseDirectory>/.pvl/`, which also gets a `.gitignore` of `*` so it stays out of version control. With `destination` set, it goes there and nothing is added for git. Either way it is plain TypeScript and the consuming build owns compilation. `<baseDirectory>` is the directory holding `pvlconfig.json` (or the working directory for a flags-only run), which is what keeps two applications in one workspace from overwriting each other. Read that ADR before proposing to put the output in `node_modules` or expose it through `@pvl/schema`'s own `exports`.
