# The Destination File

What `@pvl/schema-compiler` writes and where. Read this before you change the compiler's output, its layout, or where it lands.

## One `Destination File`, and nothing is ever rewritten

The compiler writes a single **`Destination File`** and modifies nothing else — not the developer's tracked source, not their build output, in any mode. There is no `production` flag. Adopting a Compiled Schema is one import-path change the developer makes by hand (`from './schemas/user.js'` → `from '@pvl/compiled-schemas'`). See [ADR-0005](../../adr/0005-compiler-emits-a-destination-file-and-rewrites-nothing.md).

## A complete mirror

The `Destination File` is a **complete mirror** of the scanned set — see ADR-0005 for why. Every file `include` matches is mirrored, with or without a `pvl.compile(...)` call, and `@pvl/schema` stays a runtime dependency of the `Destination File`: every Compiled Schema extends its `Schema` class, and the mirror carries ordinary interpreted schemas too.

### Layout

The file opens with a `@generated` header, then one import block, then each scanned module under a banner naming its source file relative to the base directory. An existing destination is overwritten, and output is byte-stable across runs with unchanged input.

Modules come in **dependency order, ties broken by sorted path**: a module follows every scanned module it imports at runtime, and modules with no such link between them keep sorted path order. Plain path order would put `order.ts` ahead of the `user.ts` it imports, and reading `user` would then hit the temporal dead zone. An import cycle among scanned files has no such order, so it is the `IMPORT_CYCLE` error. A type-only import is erased, so it neither orders modules nor forms a cycle.

### One top-level scope

Every mirrored module shares the file's one top-level scope, so the compiler (ts-morph, statically) rewrites the seams between them:

- **Imports from outside the set** are hoisted into the import block, merged per specifier and sorted. A relative specifier is rewritten so it resolves from the destination's directory; a bare one (`@pvl/schema`) is kept. Re-exports from outside the set stay in place, their specifier rewritten the same way.
- **A dynamic `import()` and an `import x = require()`** stay where they are, their relative specifier rewritten the same way.
- **An import into the set** (resolved the way a bundler would, so `./user.js` finds `user.ts`) collapses into a direct reference to the binding it names, and its statement is dropped. An alias is followed through, and a shorthand property keeps its key (`{ customer }` becomes `{ customer: user }`). A re-export into the set is dropped when the binding is already exported under that name, and otherwise becomes a local `export { binding as name }`. An anonymous default export is named `defaultExport` so an import of it has something to refer to.
- **A namespace import or re-export of a scanned file** (`import * as schemas from './user.js'`) isn't one binding, and keeping it would import that file a second time, so it is the `NAMESPACE_IMPORT_OF_SCANNED_FILE` error: import the names instead.
- **Names**: an exported name is never changed, and two files exporting the same name bound to different things is the `DUPLICATE_EXPORT` error. A non-exported name, or an import from outside, that clashes with another module's binding is renamed in the later module to `<name>_<n>`, together with every reference to it. An inner declaration that would shadow a binding under its new name is renamed the same way.

## Where it lands

[ADR-0015](../../adr/0015-compiled-schema-destination-resolution.md) decides it. With `destination` unset, the file goes to `<baseDirectory>/node_modules/.pvl/compiled-schemas/` as ESM + CJS + declarations built with tsup, plus a `@pvl/compiled-schemas` symlink beside it. With `destination` set, it is one plain TypeScript file and the consuming build owns compilation. `<baseDirectory>` is the directory holding `pvlconfig.json` (or the working directory for a flags-only run), which is what keeps two applications in one workspace from overwriting each other. Read that ADR before proposing to expose the output through `@pvl/schema`'s own `exports` — three Node resolution rules make it impossible.
