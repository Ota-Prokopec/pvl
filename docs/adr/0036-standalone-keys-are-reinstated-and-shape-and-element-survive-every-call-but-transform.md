# Standalone Keys are reinstated, and `shape` and `element` survive every call but `.transform()`

**`.standalone()` marks a Schema as a Standalone Key. An object's `shape` holds its Standalone Keys and no other key, at the type level and at runtime, interpreted and compiled alike. With none, it is `{}`. Every array keeps its `element`. `.standalone()` keeps the chain going, and every Modifier after it keeps the marker. `shape` and `element` survive the Modifiers, `.standalone()` and `pvl.compile()`. A `.transform()` ends them, as [ADR-0016](./0016-transform-and-compile-end-the-modifier-chain.md) decided.** The [standalone-keys spec](../specification/standalone-keys.md) (#107) holds the user-facing rules. This record holds why, and how both packages implement them.

> Superseded in part by [ADR-0039](./0039-an-arrays-element-is-opt-in-as-shapes-keys-are.md): an array's `element` is opt-in, as `shape`'s keys are. It holds the item only when `.standalone()` marked it and is `undefined` otherwise, so an unmarked item is no longer passed in as source.

```ts
const user = pvl.compile(
  pvl.object({
    email: pvl.string().min(3).standalone(),
    age: pvl.number().int(),
  }),
);

user.shape.email.validate('a@b.c'); // a compiled validator of `email` alone
user.shape.age; // a compile error: `age` isn't a Standalone Key
```

## Why opt-in, and why it comes back

[ADR-0020](./0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md) removed `shape` and `element` from a Compiled Schema, and the marker with them: a caller who wanted one field kept a reference to its schema. That left the interpreted and the compiled side of the import swap exposing different things, since an interpreted object exposed every key. It also left no way to validate one field through compiled code.

Exposing a compiled validator for every key of every compiled object would fix both, but it would make the Destination Directory grow with the whole tree, while most keys are never validated alone. Opt-in keeps it proportional to what is used. An object can have many keys, so `shape` is opt-in. An array has exactly one element, so `element` is always there, and the marker only decides whether a compiled array's `element` is compiled too. Do not remove the marker again for ADR-0020's reason: without it the two sides of the swap can't agree.

## `@pvl/schema`

- **`.standalone()` is on the `Schema` type**, so every Schema has it: a chainable one, the plain Schema `.transform()` returns, and a Compiled Schema. It returns `this & StandaloneMarker`: the receiver's own type, the type-only `StandaloneMarker` added, so it keeps the chain going. Its Modifiers, Constraints, structural methods, `shape` and `element` are all still there, with the same input and output. Calling it twice changes nothing.
- **Every Modifier after it keeps the marker.** `RetypedSchema`, which `.optional()`, `.nullable()`, `.coerce()` and `.refine()` return, rebuilds the class from its `'~kind'`, which knows nothing of an intersection on `this`, so it adds `StandaloneMarkerOf<this>`: the marker when the receiver has it. `.transform()` adds it to its plain Schema the same way. A Constraint returns `this`, which keeps it already. So the marker can be written anywhere in the chain, as the compiler already reads it and as the runtime flag already survives every later clone.
- **`Schema` becomes an interface.** That return type reads the polymorphic `this`, which a type alias can't. The repo's lint allows an interface whose body uses `this`. This amends [ADR-0029](./0029-a-compiled-schema-is-a-class-expression-implementing-the-schema-type.md), which made it a `type`. Nothing else about it changes: it is still nominal through `SCHEMA_BRAND`, and every class still `implements` it.
- **At runtime the marker is a flag, `_standalone`**, which the `Schema` interface requires as an `@internal` member. `InterpretedSchema.standalone()` returns a clone with the flag set, which every later clone copies. `ObjectInterpretedSchema` reads its fields' flags once, at construction, to build its runtime `shape`. A type-only brand can't be read at runtime, and a registry would have to be shared with Compiled Schemas, which import nothing from `@pvl/schema` at runtime. The flag never affects `validate()`.
- **The return types carry the structure, except `.transform()`'s.** `pvl.compile()` returns `Schema<InferInput<x>, InferOutput<x>>`, plus the marker when `x` has it, and `x`'s `shape` or `element` as a Compiled Schema exposes them: each Standalone Key and a marked element typed as `pvl.compile()` types it in turn, a plain Schema, as the compiler emits one for it, and an unmarked element as it is, as the compiler passes the interpreted Schema in. An interpreted `shape` holds each field's own class instead, which is what it holds at runtime. So `compiled.shape.<key>` types alike on both sides of the swap, and `pvl.compile(x.standalone())` and `pvl.compile(x).standalone()` type alike. `.standalone()`, `.optional()`, `.nullable()` and `.refine()` keep the class. At runtime, each of these returns the same instance or a clone of it, so nothing more is needed.
- **A transformed object or array has no `shape` or `element`.** `.transform()` returns a plain `Schema<Input, NewOutput>`, as [ADR-0016](./0016-transform-and-compile-end-the-modifier-chain.md) decided: it ends the chain, and its function's value can be anything, so nothing about the declared fields or item can be added or read past it. Neither `.standalone()` nor `pvl.compile()` brings them back, as each keeps only what its argument's type has. At runtime `.transform()` stays a post-modifier on a clone ([ADR-0010](./0010-modifiers-run-in-chain-order-around-the-type-check.md)), so the clone still has the getters, but its type doesn't, and nothing reads them.
- **No diagnostic, anywhere.** A marked Schema may be defined in one file and used as a field in another, which neither the type system nor a per-file scan can rule out. #41's planned warning for `.standalone()` on a Schema that is never compiled is dropped.

## `@pvl/schema-compiler`

- **Reading.** `.standalone()` is no Modifier. Reading a Schema takes it off the chain wherever it is written and sets `Schema.isStandalone`. `.standalone()`, `shape` and `element` read off a `pvl.compile(...)` call are no longer `COMPILE_RESULT_MODIFIED`.
- **A transformed Schema's Compiled Schema exposes nothing.** It writes no `shape` or `element`, so no Standalone Key class and no element parameter either, whatever its fields mark.
- **Every Compiled Schema** writes `readonly _standalone: boolean`, and a `standalone()` that returns a copy (`Object.create` of its prototype, its own fields assigned) with the flag set. It returns `this & PvlStandaloneMarker`, as the interface declares, so every module imports the marker's type. When a Compiled Schema is marked, it also declares the marker's brand, so its cast to `… & PvlStandaloneMarker` typechecks. A module imports `STANDALONE_BRAND` only when one of its Compiled Schemas declares it, so it imports nothing unused.
- **A Standalone Key gets a class of its own, fully inlined.** It does not wrap a function its parent calls: [ADR-0023](./0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md) inlines every check into one `_validate`, for speed, and the parent's checks stay the same whether or not a key is marked. The parent's constructor builds each one once into `shape`, so the class is evaluated once per instance. Runtime Arguments are passed on as the parent holds them (`this.arg0`), so each is still evaluated once, where the root's `pvl.compile(...)` call was ([ADR-0030](./0030-a-method-argument-the-compiler-cant-read-is-a-runtime-argument-evaluated-once-where-it-is-written.md)). The nested class is generic in nothing, as the root's type parameters are in scope where it is written. A marked element is compiled the same way.
- **An unmarked element is passed in as source.** The compiler can't spell an interpreted Schema's class type (`ObjectInterpretedSchema<{ … }, …>`). So the element's source is passed where the root's call was, and TypeScript infers its type into a type parameter (`TElement0`). That makes the root a generic arrow function, as a `.transform()` does ([ADR-0035](./0035-modifiers-compile-to-calls-to-the-users-own-functions-typed-at-their-place-in-the-chain.md)), and each class down to its array hands it on. It is evaluated in the scope it was written in, once per evaluation of the call, as the interpreted path builds it. The accepted cost: a Runtime Argument written inside an unmarked element is evaluated twice, once for the root's checks and once for the element. Only a call or another side effect there can tell.
- **Types are identical across the swap.** Each class is cast up to the type `pvl.compile()` gives: `PvlSchema<Input, Output>`, the marker, and `{ readonly shape: { … } }` or `{ readonly element: … }`. The differential test asserts every case's whole type identical to the interpreted one's, and diffs every `shape.<key>` and `element` the compiled side exposes against its interpreted counterpart. It walks from the compiled side, as an interpreted transformed object still has its getters at runtime.

## Consequences

- Supersedes ADR-0016's "a compiled object or array has no `shape`/`element`" and the parts of ADR-0020 about them and the marker, and amends ADR-0029: `Schema` is an interface with two more members. ADR-0016's "a transformed object or array has no `shape`/`element`" stands.
- Every Compiled Schema carries `_standalone` and `standalone()`, a few lines each. Every compiled object carries a `shape` and every compiled array an `element`, so a compiled array is now always built by a generic arrow function.
- Marking a key duplicates its checks in the output, once in its parent's `_validate` and once in its own class. A composite key's whole tree is duplicated. Opt-in keeps that to the keys someone validates alone.
- A test or tool reading every key of an object through `shape` must mark each key, as `@pvl/schema-compiler`'s own config schema does for its drift test.

## Considered options

- **A no-op `.standalone()`** (#47). Rejected: the runtime `shape` needs the flag.
- **`.standalone()` ending the chain with a plain `Schema`**, so no later Modifier's types could drop the marker. Rejected: it made the order matter for a marker that changes no check, only to work around `RetypedSchema` losing an intersection, which carrying the marker in `RetypedSchema` fixes. It also typed an interpreted `shape.<key>` as a plain Schema, though it is the field's own class at runtime.
- **`.standalone()` returning `RetypedSchema<this, Input, Output>`**, as `.refine()` does. Rejected: it is declared on `Schema` and `InterpretedSchema` with `this`, and TypeScript can't prove a conditional type on `this` a subtype of `this`, so `ChainableInterpretedSchema` can't override it so. `this & StandaloneMarker` is the same type once `this` is known.
- **Exposing every key, as before.** Rejected for the output size above.
- **Keeping `shape` and `element` through `.transform()`**, as each field still validates as declared. Rejected: a Transform ends the chain, and an object or array whose value the function replaces has nothing left to describe.
- **A class of its own for a transformed Schema**, so it has no getters at runtime either. Rejected: `.transform()` stays the last post-modifier of the pipeline ADR-0010 defines, and the type is the contract.
- **Spelling the interpreted element's class type**, instead of inferring it. Rejected: the compiler would have to mirror every interpreted class's type parameters, which only the type system knows after a Modifier widens them.
