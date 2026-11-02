---
'@pcvl/compiler': minor
---

`pvl compile --no-emit` runs every check a normal run does, compiling every Schema in memory, and reports the same diagnostics and exit code without writing anything, for a pre-commit hook or a CI lint stage. `runCompilation` takes the same choice as `emit` (default `true`).
