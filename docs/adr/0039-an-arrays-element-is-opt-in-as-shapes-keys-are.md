# An array's `element` is opt-in, as `shape`'s keys are

**An array's `element` holds its item Schema only when `.standalone()` marked it, at the type level and at runtime, interpreted and compiled alike. Otherwise it is `undefined`, `pvl.compile()`'s type has no `element`, and the compiler writes none. This supersedes [ADR-0036](./0036-standalone-keys-are-reinstated-and-shape-and-element-survive-every-call-but-transform.md)'s "every array keeps its `element`" and its unmarked element passed in as source. The rest of what ADR-0036 decided about `element` stands: a marked element gets a Compiled Schema of its own, and `element` survives every Modifier, `.standalone()` and `pvl.compile()`, but not `.transform()`.**

```ts
pvl.array(pvl.string()).element; // undefined
pvl.array(pvl.string().standalone()).element.validate('a'); // the item, validated alone

const tags = pvl.compile(pvl.array(pvl.string()));
tags.element; // a compile error: the item isn't marked
```

## Why

ADR-0036 kept `element` on every array because an array has one item, so exposing it costs one property, not a tree. That held on the interpreted side only. The compiler emits no class for an unmarked item, so a compiled `element` had to be the interpreted Schema, whose type it can't spell. So it passed the item's source in where the `pvl.compile(...)` call was, and let TypeScript infer its type into a type parameter. That cost:

- every array with an unmarked item a generic arrow function, and every class between it and the root a constructor parameter handing the item on;
- interpreted Schema code evaluated at load by a Schema whose checks were all compiled, for a property only `element` read;
- a Runtime Argument written inside an unmarked item evaluated twice;
- in the compiler, the numbering and parameters threaded through every Standalone Key to carry it.

Opt-in removes all of it: an array whose item nobody validates alone compiles to a plain class again. Arrays and objects also follow one rule now: what is marked is exposed, and nothing else.

## `@pcvl/schema`

- **`ArrayInterpretedSchema.element` is typed `StandaloneElement<ItemSchema>`**: the item Schema when it carries `StandaloneMarker`, and `undefined` otherwise. A getter can't be dropped from a class's type the way `shape`'s mapped type drops a key, and `undefined` makes reading through an unmarked `element` (`.element.validate(…)`) a compile error all the same. At runtime the getter reads the item's `_standalone` flag, so the runtime agrees with the type, as `shape`'s does.
- **`pvl.compile()` types an `element` only when it is a Schema.** `CompiledStructureOf` matches `element` against `Schema`, which an unmarked one's `undefined` isn't, so a Compiled Schema of such an array has no `element` key, and reading it is a compile error on both sides of the import swap. A marked one is typed as `pvl.compile()` types it, a plain Schema.

## `@pcvl/compiler`

- **An unmarked element is exposed nowhere.** `ArraySchemaEmitter._emitElementProperty` emits nothing for it, so its array's class writes no `element`. A Compiled Schema's constructor takes its Runtime Arguments only, and the root is a generic arrow function only for a `.transform()`'s output type ([ADR-0035](./0035-modifiers-compile-to-calls-to-the-users-own-functions-typed-at-their-place-in-the-chain.md)).
- A marked element is compiled as ADR-0036 decided: a fully inlined class of its own, which its array's constructor builds into `element`.

## Consequences

- Supersedes ADR-0036's "every array keeps its `element`", "an unmarked element is passed in as source" and its accepted cost of a Runtime Argument evaluated twice, and its consequence that every compiled array is built by a generic arrow function.
- Reading `pvl.array(x).element` now needs `x` marked `.standalone()`, as reading a key off `shape` does. A nested item needs a marker at each level: `list.element.element` needs both items marked.
- Marking an item duplicates its checks in the output, once in its array's `_validate` and once in its own class, as marking a key does.

## Considered options

- **Keeping ADR-0036's rule.** Rejected for the costs above, paid by every compiled array for a property most never read.
- **Typing an unmarked `element` as `never`.** Rejected: `never` has every property, so `.element.validate(…)` would typecheck, then throw.
- **Dropping `element` from the type through `pvl.array()`'s return type**, an intersection only when the item is marked. Rejected: `RetypedSchema` rebuilds the class from its `'~kind'` after every Modifier, which would drop the intersection, the problem ADR-0036 solved for the marker by carrying it explicitly. A getter on the class survives every Modifier as it is.
- **Compiling every element**, so `element` is always a Compiled Schema. Rejected for ADR-0036's size argument: it duplicates every array's item checks in the output, whether or not anyone validates an item alone.
