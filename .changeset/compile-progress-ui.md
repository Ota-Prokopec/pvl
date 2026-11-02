---
'@pcvl/compiler': minor
---

`pvl compile` draws a progress UI by default: the scanned files, a progress bar over the compiled ones, every diagnostic in color on stderr and a closing summary. `--tty false` restores the plain output, and `--json` is unchanged. A crash inside the compiler now ends the run with an `INTERNAL_ERROR` diagnostic carrying the stack, and exit code `1`.
