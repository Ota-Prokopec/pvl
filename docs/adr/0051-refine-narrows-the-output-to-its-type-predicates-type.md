# `.refine()` narrows the Output to its type predicate's type

**When the predicate passed to `.refine()` is a TypeScript type predicate, written out (`(value): value is T => …`) or inferred (`(value) => value === 'ahoj'`, TypeScript ≥ 5.5), the Schema's Output narrows to its type. A predicate typed as returning `boolean` leaves the Output as it was. The Input never narrows. The narrowed Output is `R | Extract<Output, null | undefined>`, where `R` is the predicate's type and `Output` the Schema's Output where `.refine()` is chained.** This amends [ADR-0016](./0016-transform-and-compile-end-the-modifier-chain.md), under which `.refine()` returned `RetypedSchema<this, Input, Output>`, and [ADR-0035](./0035-modifiers-compile-to-calls-to-the-users-own-functions-typed-at-their-place-in-the-chain.md), under which a compiled `.refine()`'s predicate is spelled `(value: …) => boolean`. Runtime validation doesn't change, interpreted or compiled. Spec: #230.

```ts
pvl.string().refine((v) => v === 'ahoj'); //            Output: 'ahoj',   Input: string
pvl.string().refine((v) => v === 'a' || v === 'b'); //  Output: 'a' | 'b'
pvl.string().refine((v) => v.length > 3); //            Output: string (not a predicate)
pvl
  .string()
  .nullable()
  .refine((v) => v !== null); //   Output: string | null
pvl
  .string()
  .refine((v) => v === 'ahoj')
  .optional(); // Output: 'ahoj' | undefined
```

## Why

After `pvl.string().refine((v) => v === 'ahoj')` every accepted value is `'ahoj'`, so typing the Output `string` made a developer cast the value, or swap the Refinement for a `.transform()` that only retypes it. Both drop the guarantee the predicate already proved.

- **Only TypeScript's predicates narrow.** Nothing reads the predicate's body. Whatever TypeScript types as `value is R` narrows, and nothing else does.
- **Only the Output narrows.** The Input is what may be passed in, as `.coerce()` widening it to `unknown` shows. A narrowed Input would make the Refinement unable to reject anything at the type level.
- **What short-circuits stays.** A value `.optional()` or `.nullable()` accepted never reaches the predicate ([ADR-0010](./0010-modifiers-run-in-chain-order-around-the-type-check.md)), while the predicate's parameter is still typed with its `null`/`undefined` (ADR-0016). Plain `R` would be unsound: `pvl.string().nullable().refine((v) => v !== null)` would claim `string` and accept `null`. A `null`/`undefined` from a Modifier chained after the Refinement is added by that Modifier, as always.

## The signature: V1

One signature on the Shared Modifier, no overloads, generic in the refined type with the current Output as its default. The parameter is a union of a type predicate and a `boolean` function, so a non-predicate falls back to the default:

```ts
refine<Refined extends Output = Output>(
  predicate: ((value: Output) => value is Refined) | ((value: Output) => boolean),
  options?: CheckOptions,
): RetypedSchema<this, Input, Refined | Extract<Output, null | undefined>>
```

It still returns `RetypedSchema`, so the Schema's class, an object's `shape`, an array's `element` and the `.standalone()` marker are kept, and Constraints chained after it keep the narrowed Output. Every Chainable Schema gets it with no per-class work.

A Compiled Schema types alike, so the two sides of the swap agree ([ADR-0036](./0036-standalone-keys-are-reinstated-and-shape-and-element-survive-every-call-but-transform.md)): each `.refine()`'s Runtime Argument gets a type parameter on the root's generic arrow, `TArg<n>Refined extends <output> = <output>`, beside `.transform()`'s `TArg<n>Output`, which now defaults to `unknown` so every type parameter has a default and they keep the Runtime Arguments' order, and its predicate is spelled `((value: <output>) => value is TArg<n>Refined) | ((value: <output>) => boolean)`, the same shape as V1.

## Alternatives rejected

- **V2: infer the whole function and read the predicate with a conditional type.** The Schema would be generic in the function itself, `<TArg0 extends (value: string) => boolean>(arg0: TArg0)`, with the Output spelled `TArg0 extends (value: any) => value is infer R ? R : string`. It works, the nullable case included, but the conditional type has to be repeated wherever the Output is spelled, its `any` needs a lint exception, and the interpreted side would need a different signature, while V1 is one shape on both sides.
- **Narrowing to plain `R`.** Unsound after `.nullable()`/`.optional()`, as above.
- **Shipping the compiler part later**, which would type a Schema `'ahoj'` before compilation and `string` after.
- **Reporting a narrowing `.refine()` as `UNSUPPORTED_SCHEMA`.** The compiler checks syntax, not types ([ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)), so it can't tell when TypeScript infers a predicate, and the diagnostic would hit every `.refine()`.

## Accepted risk: surprise narrowing

Zod v3 narrowed on type predicates. Zod v4, as far as we know, ignores them, because TypeScript's inferred predicates narrow where a developer didn't expect it. pvl narrows on purpose: an existing `.refine((v) => v === 'a' || v === 'b')` now outputs `'a' | 'b'`, which can surface a type error downstream. The packages are in prerelease, and the changeset says so.
