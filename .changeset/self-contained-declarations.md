---
'@pcvl/schema': patch
'@pcvl/compiler': patch
---

The published declarations are self-contained: they no longer import the private `@repo/types`, so a project with only `@pcvl/*` installed type-checks, and CJS consumers get `.d.cts` types matching their format.
