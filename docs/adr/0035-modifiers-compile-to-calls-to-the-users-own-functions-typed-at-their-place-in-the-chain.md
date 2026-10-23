# Modifiers compile to calls to the user's own functions, typed at their place in the chain

**`.coerce()`, `.refine()` and `.transform()` are baked into a Compiled Schema where the interpreted pipeline runs them ([ADR-0010](./0010-modifiers-run-in-chain-order-around-the-type-check.md)). `.coerce()` is an inlined conversion, and the functions passed to `.refine()` and `.transform()` are called, never inlined. Each function is typed as the interpreted chain types it at the place it is chained, and a `.transform()`'s output is inferred through a generic arrow function that builds the Compiled Schema.** This amends [ADR-0033](./0033-an-emitter-dispatches-chained-methods-through-typed-method-tables.md), under which all three were in no table and so `UNSUPPORTED_SCHEMA`.

```ts
// pvl.string().refine(isShort).optional().transform((value) => value?.length)
export const name = (<TArg1Output,>(arg0: (value: string) => boolean, arg1: (value: string | undefined) => TArg1Output): PvlSchema<string | undefined, TArg1Output> => new (class PvlCompiledSchema0 implements PvlSchema<string | undefined, TArg1Output> {
  …
      if (!this.arg0.call(undefined, value as never)) { issues.push({ code: "CUSTOM", … }); }
  …
  if (issues.length === valueIssueCount) {
    value = this.arg1.call(undefined, value as never);
  }
})(arg0, arg1))(isShort, (value) => value?.length);
```

## A function is a Runtime Argument, called on the value

A function passed to `.refine()` or `.transform()` is never a literal, so it is a Runtime Argument ([ADR-0030](./0030-a-method-argument-the-compiler-cant-read-is-a-runtime-argument-evaluated-once-where-it-is-written.md)). It is evaluated once where it is written, passed to the constructor and read off the instance, then called with `.call(undefined, …)`, as the interpreted path calls it with no `this`, so a `function` never sees the instance's fields. Its body is the user's code, and inlining it would mean compiling arbitrary JavaScript, which the compiler doesn't do. The value is passed `as never`. The constructor types the function's parameter exactly, but the value may be typed otherwise where it is read: a literal's check doesn't narrow it, and a composite's output is a record. The compiler checks syntax, not types ([ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)).

## The pre-modifiers compose in chain order

`.coerce()` replaces the value before the type check, so pre-modifiers stop being a list of short-circuit conditions and become a list of `PreModifierStep`s in chain order. Each step is a condition or a conversion, from the `shortCircuitConditions` table or the new `coercions` table. The Frame composes them as they run. Conditions chained one after another share one `if (!(…))` guard, so the output for `.optional()`/`.nullable()` alone is unchanged. A conversion is a statement placed where it is chained, so `.optional().coerce()` converts inside the guard and `.coerce().optional()` converts before it. Each primitive's conversion is inlined from `src/emitters/coercions.ts`, which mirrors `@pvl/schema`'s `coercions.ts`, since the emitted code imports nothing at runtime. A literal converts as the primitive of its value. An object, an array and an enum keep the identity, as their `_coerceInput` does, and emit nothing. A converted value is declared with `let`.

## A composite's post-modifiers read its output, in chain order

An interpreted post-modifier reads `_checkType`'s output. So a composite's post-modifiers now run after its output statements, read its output local (`output1`), and then hand the output on. Before this, they ran on its input before the output was built. Constraints, which read only an array's length, never told the two apart, but a `.refine()` does. An object's post-modifiers run in chain order, `.strict()` among them where the winning one is chained. `.strict()` only reports the undeclared keys, so the interpreted value still carries them. When a `.refine()` runs under `.strict()`, the object copies them onto its output, as `.passthrough()` does, so the predicate sees what the interpreted one sees. Any such key fails `.strict()`, so that output is never accepted.

## A transform replaces the value once nothing failed

`.transform()` writes a third kind of text, `EmittedTransform`, from a `transforms` table, and a Schema's parts carry it apart from its checks (`SchemaParts.transforms`). It is tagged `REQUIRES_ALL_PASSED` and `RUNS_AFTER_SHORT_CIRCUIT`. So the Frame counts the Issues before the Schema's checks (`field0IssueCount`, named after the value) and runs it after them, short-circuit guard included, only if that count is unchanged. An object field whose function may return `undefined` is left off the output when its key was omitted, as the interpreted object leaves off any `undefined` result of an omitted key.

## Types are spelled at each Modifier's place in the chain

The interpreted chain types a function by the Modifiers chained before it. In `pvl.string().refine(isShort).optional()`, `isShort` takes `string`, not `string | undefined`. An inline function's parameter is typed contextually from that, so the constructor must type it the same way, or the destination wouldn't type-check. Each `SchemaModifierCall` therefore carries its `chainIndex`, and `_spellTypes({ schema, chainEnd })` spells the types as the methods before `chainEnd` left them. An emitter's `_spellParameterTypes` hook types `.refine()`'s predicate and `.transform()`'s function from those types. A `.coerce()` widens the Input to `unknown`, and an object key whose Input takes `undefined` is optional, a coerced one's included.

A `.transform()`'s output is whatever its function returns, which only TypeScript can infer. Each one makes the Compiled Schema generic in a type parameter, `TArg<n>Output`, named after its Runtime Argument. A generic class alone can't be upcast without naming that type, and leaving it un-cast puts an anonymous class type in declaration files. So a Compiled Schema with a type parameter is built by a generic arrow function. The arrow takes the Runtime Arguments, so TypeScript infers the type parameter from the passed function as it infers `.transform<NewOutput>()`. Its return type is the upcast. A Compiled Schema without one keeps its `as PvlSchema<…>` cast, so its output is unchanged.

An object with a transformed field can't say statically whether that field's key is optional, since that depends on whether the function returns `undefined`. Its output type intersects the other fields with `(undefined extends TArg0Output ? { age?: TArg0Output } : { age: TArg0Output })`, flattened by a homomorphic mapped type, as `@pvl/schema`'s `ObjectOutput` flattens its parts. Once the type parameter is inferred, that type is identical to the interpreted one, which the strict type check of the differential test asserts. `ObjectOutput` itself can't be named. Its parts are mapped types with an `as` clause, and over a type parameter each reference to them is a type of its own, which TypeScript can't relate even to another reference written the same way.

## Alternatives rejected

- **Typing a transform's output `unknown`** would make an import swap change every downstream type, against [`schema/compile.md`](../specification/schema/compile.md)'s drop-in contract.
- **Typing every function `(value: never) => …`** accepts any function, but types an inline function's parameter as `never`, so `(value) => value.length` wouldn't type-check in the destination.
- **Running a composite's post-modifiers on its input** is what the Frame did. It hands a `.refine()` the unstripped object with its unconverted children.
