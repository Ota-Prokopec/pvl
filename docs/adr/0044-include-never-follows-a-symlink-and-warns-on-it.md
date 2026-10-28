# `include` never follows a symlink, and warns on it

**A symlink `include` matches, to a file, a directory or nothing, is never followed, and neither is one on the way to a file a pattern reaches through a symlinked directory. The scanner skips what lies behind it and reports one `SYMLINK_SKIPPED` warning on the symlink.**

- A file reached through a symlink has two paths: the one `include` matched, which places its mirrored module and which the compiler resolves its imports from, and its real one, which Node and TypeScript (without `preserveSymlinks`) resolve them from. A `../` import then names one file in the source and another in the mirror.
- A file matched through its real path and through a symlink would be mirrored twice.
- `fs.glob` doesn't go through a symlinked directory consistently: it does for a pattern naming one (`src/linked/*.ts`), one level in for `src/**/*`, and not for `src/**/*.ts`. The scanner checks every match's directories for a symlink, so what is skipped doesn't depend on how a pattern is written.
- A Schema in a file a symlink leads to can still be imported into a scanned file and nested in a Schema there ([ADR-0043](./0043-the-compiler-follows-a-const-into-another-file-and-a-runtime-argument-there-is-an-error.md)).

## Considered options

- **Follow symlinks.** Rejected for the two paths above.
- **Skip them silently**, as before. A file the user's `include` named disappeared from the mirror without a word. Rejected.
- **An error.** A symlink in a scanned tree isn't a mistake in itself, and `strict` promotes the warning for a run that wants one. Rejected.
