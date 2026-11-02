---
'@pcvl/compiler': minor
---

A Compiled Schema narrows its Output to a `.refine()` predicate's type exactly as the interpreted Schema does, so `pvl.compile(pvl.string().refine((value) => value === 'ahoj'))` outputs `'ahoj'` in the Destination Directory too. Each `.refine()` makes the emitted Compiled Schema generic in `TArg<n>Refined extends <output> = <output>`, beside `.transform()`'s `TArg<n>Output`, so a `boolean` predicate still leaves the Output as it was. Runtime validation is unchanged.
