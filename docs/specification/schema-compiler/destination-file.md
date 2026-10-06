# The Destination File

What `@pvl/schema-compiler` writes and where. Read this before you change the compiler's output, its layout, or where it lands.

## One `Destination File`, and nothing is ever rewritten

The compiler writes a single **`Destination File`** and modifies nothing else — not the developer's tracked source, not their build output, in any mode. There is no `production` flag. Adopting a Compiled Schema is one import-path change the developer makes by hand (`from './schemas/user.js'` → `from '@pvl/compiled-schemas'`). See [ADR-0005](../../adr/0005-compiler-emits-a-destination-file-and-rewrites-nothing.md).

## A complete mirror

The `Destination File` is a **complete mirror** of the scanned set — see ADR-0005 for why. What that costs the compiler: ts-morph rewrites imports and re-exports so they resolve from the new location; an import whose target is itself in the scanned set collapses into a direct in-file reference and its import statement is dropped. Modules are emitted in sorted path order under a banner naming each source file, behind a `@generated` header, and output is byte-stable across runs with unchanged input. `@pvl/schema` stays a runtime dependency of the `Destination File`: every Compiled Schema extends its `Schema` class, and the mirror carries ordinary interpreted schemas too.

## Where it lands

[ADR-0015](../../adr/0015-compiled-schema-destination-resolution.md) decides it. With `destination` unset, the file goes to `<baseDirectory>/node_modules/.pvl/compiled-schemas/` as ESM + CJS + declarations built with tsup, plus a `@pvl/compiled-schemas` symlink beside it. With `destination` set, it is one plain TypeScript file and the consuming build owns compilation. `<baseDirectory>` is the directory holding `pvlconfig.json` (or the working directory for a flags-only run), which is what keeps two applications in one workspace from overwriting each other. Read that ADR before proposing to expose the output through `@pvl/schema`'s own `exports` — three Node resolution rules make it impossible.
