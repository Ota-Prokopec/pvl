# A Compiled Schema is a class expression implementing the `Schema` type

**`Schema` is an object type that classes implement, and a Compiled Schema implements it on its own, extending no class.** `Schema<Input, Output>` (`schemas/schema.ts` in `@pvl/schema`) holds `"~standard"`, `validate(value)`, an internal `_validate(value, path)` and a type-only brand. Its `"~standard"` is `StandardSchemaProps`, the Standard Schema spec's own `StandardSchemaV1.Props` narrowed, so every Schema is a `StandardSchemaV1`. It is a `type` rather than an `interface`, as the repo's lint requires of a type no class in its own file implements, and a class `implements` either the same way. The class that owned the pipeline is now `InterpretedSchema` (`schemas/interpretedSchema.ts`), which implements it. Every factory's class extends it through `ChainableInterpretedSchema`, and each is named after the interpreted path it runs (`StringInterpretedSchema` in `stringInterpretedSchema.ts`). A field, an element, a union member, `.transform()`'s result and `pvl.compile()`'s result are all typed as `Schema`.

**Each `pvl.compile(...)` call is replaced, where it is written, by an instance of a named class expression:**

```ts
export const user = (new (class PvlCompiledSchema0 implements PvlSchema<string, string> {
  declare readonly [PVL_SCHEMA_BRAND]: true;

  get "~standard"(): PvlStandardSchemaProps<string, string> { … }

  validate(value: unknown): PvlResult<string> {
    return this._validate(value, []) as PvlResult<string>;
  }

  _validate(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> { … }
})() as PvlSchema<string, string>);
```

`_validate` holds the checks of the whole tree, nested Schemas inlined ([ADR-0023](./0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md)). `validate` calls it at the root and casts its Result, and `"~standard"` calls `validate`. The module imports only types from `@pvl/schema` for it.

Before, a Compiled Schema extended the pipeline class, filled its `_checkType` with the emitted checks and inherited the rest. That has three costs, each of which this record removes:

- **It carried a pipeline it never ran.** Every Modifier is baked into the emitted checks, so its modifier arrays were always empty, yet each instance held them, and its prototype held the runners, `_checkType`, `_coerceInput`, `_clone` and the `_with…` helpers. Every `validate()` also ran the empty runners, so in a Node 24 micro-benchmark a compiled `pvl.string()` was no faster than the interpreted one, at about 30 ns per call. In this shape it takes about 7 ns, and an interpreted object takes about 114 ns with its one field compiled, against 137 ns with it interpreted.
- **The compiler's contract with `@pvl/schema` was the pipeline class.** The emitted class depended on `_checkType`'s signature and on what the inherited `_validate` did around it. Now it depends on the `Schema` type alone. `implements` makes a change to that type fail the typecheck of every Destination Directory.
- **The code sat far from its schema.** Each class was hoisted after the module's imports, and the call became `new PvlCompiledSchema<n>()`. Written in place, the checks are where the schema was declared, the class indented to the line of the call.

The rest of the shape follows from those:

- **`_validate` returns `Result<unknown>` on the `Schema` type.** The emitted checks build values TypeScript can't follow back to `Output` (`const output: Record<string, unknown> = {}`). So `validate` is the one place that casts, as the pipeline's own `_validate` casts. `InterpretedSchema._validate` still returns `Result<Output>`, which the type accepts.
- **The brand keeps the type nominal.** An object type has no private members, which is what made the class nominal ([ADR-0020](./0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md)). So `@pvl/schema` exports `SCHEMA_BRAND`, an `export declare const` of a `unique symbol` type, and the type requires `readonly [SCHEMA_BRAND]: true`. Each implementing class `declare`s that key, which emits nothing, and imports `SCHEMA_BRAND` with `import type`: no value exists at runtime. A Standard Schema from another library lacks the key, so [ADR-0018](./0018-composite-fields-are-pvl-schemas-only.md) still holds at the type level. ADR-0020's caveat holds too: each installed copy of `@pvl/schema` has a brand of its own type.
- **The class expression is named and numbered** (`PvlCompiledSchema0`, `PvlCompiledSchema1`, in source order). A class expression's name is visible only inside its own body, so it can't clash with the module's names, and it names the class in a stack trace or a debugger. Of two nested `pvl.compile(...)` calls, only the outer one is replaced: its checks inline the inner one's.
- **The instance is cast up to `PvlSchema<Input, Output>`**, which the class implements, so the call site types exactly as `pvl.compile()` does. No anonymous class type reaches a declaration file. The parentheses keep a `.validate(…)` read off the call site applying to the whole of it.

## Consequences

- Amends [ADR-0020](./0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md): `Schema` is a type classes implement, the pipeline class is `InterpretedSchema`, and a Compiled Schema extends no `@pvl/schema` class. `pvl.compile()` still returns a plain `Schema`.
- Amends [ADR-0018](./0018-composite-fields-are-pvl-schemas-only.md): a child is any `Schema`, an Interpreted Schema or a Compiled Schema, and its nominality comes from the brand. A composite still calls each child's `_validate(value, [...path, key])`.
- Amends [ADR-0003](./0003-compiled-schemas-conform-to-standard-schema.md): a Compiled Schema writes its own `"~standard"` rather than inheriting it. It still reports `vendor: "@pvl/schema"`, written from `VENDOR` at compile time.
- Every Compiled Schema repeats `"~standard"` and `validate`, a few lines each, and spells its types four times.
- A class expression inside a function is evaluated on every call, so each call creates a class as well as an instance.
- A Compiled Schema is no instance of `InterpretedSchema`. Nothing checks that at runtime, and the mirror needs `@pvl/schema` at runtime only for the interpreted schemas it carries.

## Considered options

- **Keep extending the pipeline class, overriding `_validate` to call the emitted checks alone.** Just as fast. Rejected: the Compiled Schema keeps the pipeline's state and helpers, and the contract keeps `_checkType` and `_validate`.
- **A runtime base class that both `InterpretedSchema` and each Compiled Schema extend, holding `validate` and `"~standard"`, so the emitted class has one method.** Rejected: it ships one more class in `@pvl/schema` for two short methods, where a type built on the Standard Schema spec's own types costs nothing at runtime.
- **A type built on `StandardTypedV1` alone.** Rejected: it has no `"~standard".validate`, so neither path would be a Standard Schema ([ADR-0001](./0001-adopt-standard-schema.md)).
- **Class declarations hoisted after the imports, as before.** Rejected: they put a schema's checks far from where the schema is declared.

> Amended by [ADR-0036](./0036-standalone-keys-are-reinstated-and-shape-and-element-survive-every-call-but-transform.md): `Schema` is now an interface, as `.standalone()`'s return type reads the polymorphic `this`, and a Compiled Schema also writes `_standalone` and `.standalone()`.
