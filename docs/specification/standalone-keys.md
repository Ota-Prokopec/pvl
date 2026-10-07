# Standalone Keys

Spec for [#107](https://github.com/Ota-Prokopec/pvl/issues/107), part of #41.

## Problem Statement

A developer who wraps an object Schema in `pvl.compile()` gets one compiled validator for the whole object, and nothing else. There is no way to validate one field of that object on its own through compiled code: [ADR-0020](../adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md) removed `shape` and `element` from a Compiled Schema, and with them the `.standalone()` marker and the Standalone Key.

Exposing a compiled validator for every key of every compiled object would fix that, but it would multiply the size of the Destination File for keys nobody ever validates alone. The developer needs to say, per key, "this one gets its own compiled validator", and have the type system show exactly which keys that is, the same way on the interpreted and the compiled side of the import swap.

Today the interpreted side does not match either: an interpreted `pvl.object()` exposes every key through `shape`, while a compiled one exposes nothing, so swapping `from './schemas/user.js'` for `from '@pvl/compiled-schemas'` changes what compiles.

## Solution

A `.standalone()` marker, callable on any Schema, that marks it as a **Standalone Key** when it is used as a field of a `pvl.object()`. Only Standalone Keys appear in that object's `shape`, at both the type level and runtime, interpreted and compiled alike; an object with none has `shape: {}`. When the object is compiled, `@pvl/schema-compiler` also emits a public Compiled Schema for each Standalone Key, reachable as `compiled.shape.<key>`.

```ts
const user = pvl.compile(
  pvl.object({
    email: pvl.string().min(3).standalone(),
    age: pvl.number().int(),
  }),
);

user.shape.email.validate('a@b.c'); // compiled validator for `email` alone
user.shape.age; // compile error: `age` is not a Standalone Key
```

An array always exposes its single `element`, on both sides. It is a Compiled Schema when the element was marked `.standalone()`, and the original interpreted element Schema otherwise.

`shape` and `element` survive every call that hands back a Schema (`.optional()`, `.nullable()`, `.refine()`, `.transform()`, `.standalone()` and `pvl.compile()`), so nested structure stays reachable through a marked key at any depth.

## User Stories

1. As a `pvl` user, I want to mark a field of a `pvl.object()` with `.standalone()`, so that I can validate that one field on its own without validating the whole object.
2. As a `pvl` user, I want a compiled object to emit a compiled validator only for the keys I marked, so that the Destination File stays small for large objects.
3. As a `pvl` user, I want only my `.standalone()` keys in an object's `shape` type, so that the editor shows me exactly which fields can be validated alone.
4. As a `pvl` user, I want an unmarked key to be a compile error when I read it from `shape`, so that I never get `undefined` at runtime.
5. As a `pvl` user, I want an unmarked key to be absent from `shape` at runtime too, so that the runtime agrees with the types.
6. As a `pvl` user, I want an interpreted and a compiled object to expose the same `shape`, so that swapping the import to `@pvl/compiled-schemas` never changes what compiles.
7. As a `pvl` user, I want an object with no `.standalone()` keys to have `shape: {}`, so that `shape` is always present on an object and reading any key from it is a compile error.
8. As a `pvl` user, I want `.standalone()` to leave validation untouched, so that marking a key never changes what the object accepts or the Issues it reports.
9. As a `pvl` user, I want `shape.<key>.validate()` to behave exactly like the Schema I declared for that key, so that validating a field alone gives the same Result as the field would inside the object, minus the key prefix on Issue paths.
10. As a `pvl` user, I want to call `.standalone()` after `.transform()`, so that a transformed field can still be a Standalone Key.
11. As a `pvl` user, I want to call `.standalone()` on the result of `pvl.compile()`, so that `pvl.object({ a: pvl.compile(x).standalone() })` exposes `a`.
12. As a `pvl` user, I want `pvl.compile(x.standalone())` to mean the same as `pvl.compile(x).standalone()`, so that the order of those two calls never matters.
13. As a `pvl` user, I want `.standalone()` to end the Modifier chain, so that there is one place to put it: last.
14. As a `pvl` user, I want chaining a Modifier or Constraint after `.standalone()` to be a compile error, so that `pvl.string().standalone().min(1)` is caught at author time.
15. As a `pvl` user, I want calling `.standalone()` twice to be allowed and harmless, so that a redundant marker never breaks my build.
16. As a `pvl` user, I want `.standalone()` on a Schema that is not an object field to be allowed, so that I can define a marked Schema in one file and import it as a field elsewhere.
17. As a `pvl` user, I want `.standalone()` never to produce a compiler diagnostic, so that a Schema shared across files is not flagged where it happens to be unused as a field.
18. As a `pvl` user, I want a nested object's own `shape` reachable only when that nested key is itself marked, so that `shape` is strictly what I opted into at every level.
19. As a `pvl` user, I want `shape` to survive `.optional()`, `.nullable()` and `.refine()` on an object, so that a modified object still exposes its Standalone Keys.
20. As a `pvl` user, I want `shape` to survive `.transform()`, so that I can still validate a field alone after transforming the whole object.
21. As a `pvl` user, I want `shape` to survive `.standalone()`, so that a marked nested object still exposes its own Standalone Keys.
22. As a `pvl` user, I want `shape` to survive `pvl.compile()`, so that a compiled object exposes its Standalone Keys.
23. As a `pvl` user, I want every array to expose its `element`, so that I can validate a single item on its own.
24. As a `pvl` user, I want `element` to be a Compiled Schema when I marked the element `.standalone()`, so that validating one item uses compiled code.
25. As a `pvl` user, I want an unmarked `element` to stay the interpreted Schema I declared, so that the compiler emits no extra code for items nobody validates alone.
26. As a `pvl` user, I want `element` to survive the same calls `shape` does, so that arrays and objects follow one rule.
27. As a `pvl` user, I want an object element's `shape` to follow the Standalone Key rule, so that `list.element.shape` is opt-in like every other `shape`.
28. As a `pvl` user, I want a union to expose no member Schemas, so that the surface stays as it is today.
29. As a `pvl` user, I want a primitive Standalone Key to get its own small compiled validator, so that I can validate it alone even though the parent inlines its check.
30. As a `pvl` user, I want a composite Standalone Key's compiled validator to reuse the function its parent already calls, so that marking it adds almost no output.
31. As a `pvl` user, I want unmarked nested composites still compiled inside their parent, so that marking keys only changes what is exposed, never how fast the parent validates.
32. As a `pvl` user, I want `pvl.compile()` to stay a runtime identity function on Schemas carrying Standalone Keys, so that an uncompiled source file still validates through the interpreted path.
33. As a `pvl` maintainer, I want the compiled `shape.<key>` and `element` diffed against their interpreted counterparts, so that a divergence is caught by the test suite rather than in production.
34. As a `pvl` maintainer, I want the reversal of ADR-0020's "`.standalone()` goes" recorded in an ADR, so that nobody removes the marker again for the reason it was first removed.

## Implementation Decisions

### The marker

- `.standalone()` is a method on the `Schema` base class, so it exists on every Schema: chainable ones, the plain Schema `.transform()` returns, and the plain Schema `pvl.compile()` returns. No class is added to the hierarchy.
- It ends the Modifier chain. It returns a plain `Schema<Input, Output>` intersected with a type-only Standalone marker type, plus `shape` or `element` when the receiver had one. No Modifier, Constraint or structural method (`.strict()`, `.min()`, ...) is reachable on the result.
- At runtime it is **not** a no-op: it returns a clone carrying a private Standalone flag, which every later clone copies. The flag is what an `ObjectSchema` reads when it builds its runtime `shape`. It never affects `validate()`.
- Calling it on an already-marked Schema is allowed and changes nothing further.
- It is valid on any Schema, field or not. It never produces a diagnostic, in `@pvl/schema` or in the compiler: a marked Schema may be defined in one file and used as a field in another, which neither the type system nor a per-file scan can rule out.

### `shape` (objects only)

- `shape` is defined on `ObjectSchema` only; primitives, unions, literals and enums have none.
- It holds exactly the fields carrying the Standalone marker, at both the type level and runtime, interpreted and compiled. With no marked fields it is `{}`. This narrows the all-keys `shape` from #44.
- Each value is the declared field Schema. For a nested object or array field, its own `shape`/`element` follow the same rules, so `outer.shape.address.shape.city` requires both `address` and `city` to be marked.
- `ObjectSchema` overrides the return types of `.transform()` and `.standalone()` so they keep `{ readonly shape: ... }` on the plain Schema they return. `.optional()`, `.nullable()` and `.refine()` already keep the class. At runtime nothing extra is needed: each of these returns the same `ObjectSchema` instance or a clone of it.
- This supersedes ADR-0016's statement that a transformed object has no `shape`: `shape.<key>` is the field's own validator, which a Transform on the parent does not change.

### `element` (arrays)

- Every `ArraySchema` keeps its `element`, interpreted and compiled, with or without a marker, and it survives the same calls as `shape`, through the same return-type mechanism.
- An object element's `shape` follows the Standalone Key rule.
- `.standalone()` on an element only decides whether the compiler emits a compiled `element`; it does not decide whether `element` exists.

### `pvl.compile()`

- It stays a runtime identity function and accepts any Schema.
- Its return type is `Schema<InferInput<x>, InferOutput<x>>` plus the argument's `shape` or `element` and its Standalone marker, when present, and nothing else. No Modifier can be chained onto it, but `.standalone()` can, because it lives on `Schema`.
- `pvl.compile(x.standalone())` and `pvl.compile(x).standalone()` produce the same type and, as a field, the same `shape` entry.
- This supersedes ADR-0020's "`pvl.compile(x)` returns a plain Schema with neither `shape` nor `element`", and its removal of `.standalone()` and the Standalone Key.

### Unions

- A `UnionSchema` exposes no member Schemas, interpreted or compiled. Unchanged from today.

### What the compiler emits

- A compiled parent still validates every nested composite field through a private emitted function per child, per ADR-0017's inline-with-delegation rule, marked or not. Primitive checks stay inlined in the parent body.
- For each Standalone Key, the compiler additionally emits a public Compiled Schema exposed as `shape.<key>`. A composite Standalone Key wraps the private function the parent already calls; a primitive one gets a small function of its own, duplicating the check the parent inlines. That duplication is accepted.
- A compiled array's `element` is a public Compiled Schema when the element is marked, built the same way; otherwise it is the interpreted element Schema, which the Destination File already contains as copied-through source.
- A compiled object Schema class defines `shape` itself, holding exactly those emitted Compiled Schemas, so its runtime surface matches the interpreted one.

### Domain and decision records

- A new ADR reinstates `.standalone()` and the Standalone Key, records that `shape`/`element` survive `.transform()`, `.standalone()` and `pvl.compile()`, and states the size argument for opt-in exposure. It supersedes the matching parts of ADR-0016 and ADR-0020, and both get a pointer to it, as ADR-0020 did to ADR-0016.
- `GLOSSARY.md` regains **Standalone Key**: a field of an object Schema marked `.standalone()`, the only kind of key that appears in `shape`, and the only kind the compiler emits a separate Compiled Schema for. The **Compiled Schema** entry gains `shape`/`element`.
- The `@pvl/schema` specification for `pvl.compile()` and the compiler's code-generation and compilation specifications are updated to match.

## Testing Decisions

A good test exercises external behaviour only: what a Schema's `validate()`, `shape` and `element` return, what the type system accepts and infers, and, for the compiler, what it writes and how the emitted code behaves. Never the private Standalone flag, the modifier arrays, or the compiler's internal representation.

### `@pvl/schema`: existing seams only

- **Type-level inference** (prior art: the type-level blocks of the compile and standard-schema-types suites). `shape` holds exactly the marked keys, `{}` when none, and nested `shape`s require a marker at each level. `shape`/`element` survive `.optional()`, `.nullable()`, `.refine()`, `.transform()`, `.standalone()` and `pvl.compile()`. `.standalone()` ends the chain: Modifiers, Constraints and structural methods are `@ts-expect-error` after it. Both compile/standalone orders typecheck to the same type. A union exposes nothing.
- **`validate()` → `Result`** (prior art: the object and array suites). `.standalone()` changes neither accepted values nor Issues. The runtime keys of `shape` equal the marked keys exactly. `shape.<key>.validate()` and `element.validate()` match the declared field Schema.
- **`pvl.compile()` identity** (prior art: the compile suite). `toBe` still holds for an argument carrying Standalone Keys.
- No Issue-shape change: paths are unaffected.
- The existing tests asserting an all-keys interpreted `shape`, and a compiled Schema with neither `shape` nor `element`, are rewritten to the new rules rather than kept alongside them.

### `@pvl/schema-compiler`: its programmatic entry-point seam

- The differential test diffs each emitted `shape.<key>` and marked `element` against the interpreted field Schema under `fast-check`, comparing accepted values, Issue messages and Issue paths.
- The emitted-text snapshot shows a public Compiled Schema for each marked key, none for an unmarked key, and an unmarked `element` left as the interpreted Schema.
- No CLI-seam coverage: `.standalone()` produces no diagnostic.

## Out of Scope

- Exposing union members (`options` or similar).
- A marker that makes an array's `element` absent, or a way to expose unmarked object keys.
- Making `.standalone()` order-independent: it ends the chain.
- Any compiler diagnostic about `.standalone()`; #41's planned "`.standalone()` on a never-compiled Schema" warning is dropped.
- Inlining a Standalone Key's validator into its parent differently from ADR-0017: the parent's code is the same whether or not a key is marked.

## Further Notes

- Part of #41. This replaces #47, whose terminal-type half is already on `main` (ADR-0020) and whose `.standalone()` half contradicted ADR-0020, and it reshapes #53, whose compiler side now follows this spec.
- The size argument: a compiled object holding a public compiled validator for every key, recursively, grows with the whole tree, while most keys are never validated alone. Opt-in exposure keeps the Destination File proportional to what is used, and the private per-composite functions of ADR-0017 mean exposing a composite key costs almost nothing.
- A quick microbenchmark during the design (Node 24, a 12-field object with one nested object) measured full inlining at roughly 10% faster than a call per field on valid input and 25% faster on invalid input, with calls about 3× slower when V8's own inlining was disabled. This is why the parent keeps inlining primitives and why a primitive Standalone Key gets its own small function rather than the parent calling it.
- Arrays and objects differ on purpose: an object may have many keys, so `shape` is opt-in; an array has exactly one element, so `element` is always present and the marker decides only whether it is compiled.
