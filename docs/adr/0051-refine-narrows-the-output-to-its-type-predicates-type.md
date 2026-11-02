# `.refine()` narrows the Output to its type predicate's type

**A `.refine()` whose predicate is a TypeScript type predicate narrows the Schema's Output to `R | Extract<Output, null | undefined>`.** Amends [ADR-0016](./0016-transform-and-compile-end-the-modifier-chain.md) and [ADR-0035](./0035-modifiers-compile-to-calls-to-the-users-own-functions-typed-at-their-place-in-the-chain.md). Spec: #230.

- `R` is the predicate's type, written out (`(value): value is T => …`) or inferred (TypeScript ≥ 5.5).
- A predicate returning `boolean` leaves the Output as it was.
- The Input never narrows.
- Runtime validation doesn't change, interpreted or compiled.

```ts
pvl.string().refine((v) => v === 'ahoj'); // Output: 'ahoj'
pvl.string().refine((v) => v.length > 3); // Output: string
pvl
  .string()
  .nullable()
  .refine((v) => v !== null); // Output: string | null
pvl
  .string()
  .refine((v) => v === 'ahoj')
  .optional(); // Output: 'ahoj' | undefined
```

## Why

- Every value a predicate accepts already has its type. Typing the Output wider forced a cast or a retyping `.transform()`.
- **Only TypeScript decides.** Nothing reads the predicate's body.
- **Only the Output narrows.** The Input is what may be passed in. A narrowed Input couldn't be rejected at the type level.
- **`null`/`undefined` stay.** A value `.optional()`/`.nullable()` accepts skips the predicate ([ADR-0010](./0010-modifiers-run-in-chain-order-around-the-type-check.md)), so plain `R` would be unsound.

## The signature (V1)

```ts
refine<Refined extends Output = Output>(
  predicate: ((value: Output) => value is Refined) | ((value: Output) => boolean),
  options?: CheckOptions,
): RetypedSchema<this, Input, Refined | Extract<Output, null | undefined>>
```

- One signature on the Shared Modifier, no overloads. A non-predicate falls back to the default.
- Still returns `RetypedSchema`, so the class, `shape`, `element` and `.standalone()` are kept.
- A Compiled Schema types alike ([ADR-0036](./0036-standalone-keys-are-reinstated-and-shape-and-element-survive-every-call-but-transform.md)):
  - each `.refine()` adds `TArg<n>Refined extends <output> = <output>` to the root's generic arrow;
  - its predicate is spelled like V1;
  - `.transform()`'s `TArg<n>Output` now defaults to `unknown`, so every type parameter has a default.

## Alternatives rejected

- **V2: infer the whole function, read it with a conditional type.** Repeated wherever the Output is spelled, needs an `any` lint exception, and differs from the interpreted signature.
- **Plain `R`.** Unsound after `.nullable()`/`.optional()`.
- **Compiler support later.** The Schema would type differently before and after compilation.
- **`UNSUPPORTED_SCHEMA` for a narrowing `.refine()`.** The compiler can't see types ([ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)).

## Accepted risk: surprise narrowing

- Zod v4 ignores type predicates, because inferred ones narrow unexpectedly. pvl narrows on purpose.
- An existing `.refine((v) => v === 'a' || v === 'b')` now outputs `'a' | 'b'` and may break downstream types. The packages are in prerelease; the changeset says so.

## Accepted gap: a `null`/`undefined` the predicate rejects

- `Extract<…>` keeps every `null`/`undefined`, also ones the predicate sees and rejects: `pvl.union([pvl.string(), pvl.number().nullable()]).refine((v) => v !== null)` outputs `string | number | null`. Wider than the truth, never unsound.
- The Compiled Schema reads the chain and adds back only the `.optional()`/`.nullable()` before the `.refine()`, the exact type.
- Both agree for every factory compiled today. Compiling `pvl.union()` will make them differ, and the differential test will catch it.
