# `pvl compile` draws a clack progress UI by default

**`pvl compile` draws a terminal UI with `@clack/prompts` on stdout unless `--tty false` or `--json` is passed: a frame, one line as the run enters each phase (`Scanning`, `Compiling`, `Writing`) and a closing summary ([#227](https://github.com/Ota-Prokopec/pvl/issues/227)).**

- On by default, with no TTY or `CI` detection: the UI is what a person running the command sees, and one flag turns it off.
- Diagnostics stay on stderr in their documented `<severity> <code>: <message> (<file>)` text, drawn as clack's red error or yellow warn lines, so redirecting stdout never hides one.
- `--tty false` (or `--no-tty`) prints the plain output that came before the UI, byte for byte, for scripts and CI logs.
- `--json` turns the UI off by itself, so stdout stays one JSON document without a second flag.
- `@clack/prompts` draws the frame and log lines, rather than a hand-rolled renderer.
- `runCompilation` reports each phase it enters to a `ui` argument's `onProgress`, tagged `@internal`, so TypeDoc leaves it out of the reference and it isn't documented API yet. A phase is a line written synchronously, so the run never yields to the event loop for the UI.

## Consequences

- The screen names the phase a slow run is in, not the file; a test asserts each phase line without depending on timing.
- Exit codes are the same in every mode.

## Considered options

- **Plain output by default, the UI behind a flag.** Rejected: the person at a terminal is the common case, and scripts already pass `--json`.
- **A progress bar naming each file as it compiles.** Rejected: clack's bar paints on its own timer, which a synchronous compile blocks, so naming each file meant awaiting a timer before every module, and the per-phase lines are simpler.
- **Auto-detect a TTY or `CI`.** Rejected for now: an explicit flag is easier to reason about and to test.
