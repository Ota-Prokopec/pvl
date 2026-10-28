# The compiler follows a const into another file, and a Runtime Argument there is an error

**A name a `pvl.compile(...)` argument reads is followed to the top-level `const` it is bound to, in the same file or through an import into the file that declares it. A Runtime Argument written in that other file is `RUNTIME_ARGUMENT_IN_IMPORTED_SCHEMA`, an error, because it can only be evaluated where it is written.**

- Following stays static ([ADR-0002](./0002-static-ast-compilation-via-ts-morph.md)): ts-morph binds the imported name to its declaration (`symbol.getAliasedSymbol()`) through a named, aliased or default import, an `export { … } from` or `export *` barrel and a tsconfig `paths` alias. Nothing is imported or executed, and the file it reaches needn't be one `include` matches, so a symlinked file's Schema can be nested though the file itself is skipped (`SYMLINK_SKIPPED`, [ADR-0044](./0044-include-never-follows-a-symlink-and-warns-on-it.md)).
- What is followed is still "a `const` holding one". A default-exported expression (`export default pvl.object(…)`) and a namespace import's property (`schemas.user`) hold no `const` of their own, so they stay `COMPILE_ARGUMENT_UNRESOLVABLE`, whose message says how to write them so they are followed. A `.d.ts` declares a `const` with no value, so a package's Schema isn't followed either.
- The other file is read as itself: `pvl` is recognised by what each name is bound to, in whichever file, so under that file's own Local Names, and a `const` reached twice is caught as a cycle across files as within one.
- Every diagnostic stays on the file being compiled, the one holding the `pvl.compile(...)` call, and names a line in another file with that file's path relative to it (`line 2 of ../shared/user.ts`). Every BaseException therefore carries the node it is thrown at (`offendingNode`), and the catch spells where it is ([ADR-0037](./0037-the-compilers-expected-failures-are-base-exceptions-naming-their-diagnostic.md)).
- An exported `const` built from an Imported Schema (`export const admin = user.optional()`) now counts as a Schema, so it gets its Type Aliases too.

## Why a Runtime Argument in the other file is an error

[ADR-0030](./0030-a-method-argument-the-compiler-cant-read-is-a-runtime-argument-evaluated-once-where-it-is-written.md) evaluates a Runtime Argument once, where it is written, as the interpreted path does, and copies it into the Compiled Schema as written. Inlined into another file, that text names the bindings of the file it was written in: `LIMIT` in `.max(LIMIT)` doesn't exist in the file being compiled, or names something else there. A function passed to `.refine()` or `.transform()` is always one, so an Imported Schema using them can't be inlined. Its user moves the Schema into the file being compiled, or compiles it in its own file and nests it in a Schema that isn't compiled. A Runtime Argument chained onto an Imported Schema in the file being compiled is written there, so it is passed as any other.

Rejected:

- **Importing the name from the other file** when it is an exported top-level binding. A `const` that isn't exported, an inline arrow function or a call has no name to import, so the error would remain for most `.refine()` and `.transform()` calls. It can still be added later without breaking anything.
- **Having the other file's mirrored module export what the Schema needs.** The mirror would gain exports its source doesn't have, against [ADR-0005](./0005-compiler-emits-a-destination-directory-and-rewrites-nothing.md), and only a scanned file has a mirrored module at all.
- **Not following imports**, as before. A Schema shared between files couldn't be nested in a Compiled Schema, and a symlinked file's Schemas couldn't be reached at all.
