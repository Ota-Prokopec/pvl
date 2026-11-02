# `pvl compile --no-emit` checks diagnostics and writes nothing

**`pvl compile --no-emit` (`runCompilation({ emit: false })`) runs every stage of a normal run, compiling every Schema and generating every mirrored module in memory, reports the same diagnostics and exit code, and then drops the output instead of writing it ([#209](https://github.com/Ota-Prokopec/pvl/issues/209)).** It is the fast feedback path [ADR-0045](./0045-there-is-no-watch-mode-because-development-runs-the-interpreted-schemas.md) leaves room for: development runs the Interpreted Schemas, so diagnostics only the compiler raises (`UNSUPPORTED_SCHEMA`, `COMPILE_ARGUMENT_UNRESOLVABLE`, …) otherwise surface only on a full run.

- **Diagnostics only, no staleness check.** It doesn't compare the existing Destination Directory with what it would write: `.pvl/` is git-ignored by default, so staleness only means something when it is committed.
- **Nothing touches the disk**, not even a crashed run's siblings: a check that changes files would be surprising in a pre-commit hook, an editor task or a CI lint stage. The destination checks made before writing still run, so the check predicts a build failing on them.
- **A flag, not a config key**, so no `pvlconfig.json` can turn the compiler into one that never writes.
- **Named after `tsc --noEmit`**, whose meaning it carries. `--check` lost: it suggests prettier's comparison with what is on disk.

## Consequences

- The write-time half of `DESTINATION_UNWRITABLE` (a parent that is a file, a read-only directory) can't fire under `--no-emit`: a normal run finds those only when its write fails, so a clean check doesn't promise the write succeeds.
- A clean run with `--tty false` prints nothing, as `tsc --noEmit` does.
