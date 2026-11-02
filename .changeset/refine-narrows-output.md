---
'@pcvl/schema': minor
---

`.refine()` narrows a Schema's Output to its predicate's type when the predicate is a type predicate, written out (`(value): value is T => …`) or inferred by TypeScript (`(value) => value === 'ahoj'` outputs `'ahoj'`). The Input never narrows, and a `null`/`undefined` that `.nullable()`/`.optional()` lets past the predicate stays in the Output. Existing predicates TypeScript infers as type predicates now narrow too, so `.refine((value) => value === 'a' || value === 'b')` outputs `'a' | 'b'` instead of `string`, which can surface a type error downstream. Runtime validation is unchanged.
