---
'@pcvl/compiler': minor
---

`pvl compile` draws a progress UI by default: the scanned files, a progress bar over the compiled ones, every diagnostic in color on stderr and a closing summary. `--tty false` restores the plain output, and `--json` is unchanged.
