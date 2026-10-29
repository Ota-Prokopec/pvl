# `pvl compile` draws a clack progress UI by default

**`pvl compile` draws a terminal UI with `@clack/prompts` on stdout unless `--tty false` or `--json` is passed: a frame, the scan step, a progress bar over the compiled files and a closing summary ([#227](https://github.com/Ota-Prokopec/pvl/issues/227)).**

- On by default, with no TTY or `CI` detection: the UI is what a person running the command sees, and one flag turns it off.
- Diagnostics stay on stderr in their documented `<severity> <code>: <message> (<file>)` text, drawn as clack's red error or yellow warn lines, so redirecting stdout never hides one.
- `--tty false` (or `--no-tty`) prints the plain output that came before the UI, byte for byte, for scripts and CI logs.
- `--json` turns the UI off by itself, so stdout stays one JSON document without a second flag.
- `@clack/prompts` draws the frame, steps, bar and log lines, rather than a hand-rolled renderer.
- `runCompilation` reports its steps through an `onProgress` callback tagged `@internal`, so TypeDoc leaves it out of the reference and it isn't documented API yet. It awaits what the callback returns before each module, so a run without one stays synchronous.
- The UI decides when to repaint, not `runCompilation`. Clack's bar paints only on its own timer tick, and a synchronous compile blocks that tick, so a `setImmediate` yield would name a file only after it compiled, if at all. The UI gives the bar a 1 ms tick and, before each file, awaits a 1 ms timer queued after that tick, so the file's name is painted before it compiles.

## Consequences

- Every file being compiled is named on screen, and a test can assert each path without depending on timing.
- Exit codes are the same in every mode.

## Considered options

- **Plain output by default, the UI behind a flag.** Rejected: the person at a terminal is the common case, and scripts already pass `--json`.
- **Auto-detect a TTY or `CI`.** Rejected for now: an explicit flag is easier to reason about and to test.
