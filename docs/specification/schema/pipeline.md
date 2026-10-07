# The Modifier pipeline

How a `@pvl/schema` schema is built and how it runs. Read this before you add or change a Modifier, or touch `src/schemas/schema.ts` or `src/schemas/chainableSchema.ts`. [`GLOSSARY.md`](../../../GLOSSARY.md) defines the terms.

## `Schema` and `ChainableSchema`: two abstract classes, one per file

[ADR-0020](../../adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md) splits the base into two classes:

- **`Schema<Input, Output>`** (`src/schemas/schema.ts`) is everything a schema needs to validate, with no Modifier on it: the two ordered `Modifier` arrays and the constructor that seeds them, `validate()`, `"~standard"`, `_validate` with the runners that execute both arrays, the abstract `_checkType`, and every internal method a Modifier is built with (`_coerceInput`, `_clone`, `_withPreModifier`, `_withPostModifier`, `_withoutModifiers`). It is what fields, elements, union members and `pvl.compile()`'s argument are typed as, and what `.transform()` and `pvl.compile()` return. Its private and protected members mean only its own subclasses satisfy it ([ADR-0018](../../adr/0018-composite-fields-are-pvl-schemas-only.md)).
- **`ChainableSchema<Input, Output>`** (`src/schemas/chainableSchema.ts`) extends `Schema` with the five Shared Modifiers and nothing else: `.optional()`, `.nullable()`, `.refine(predicate, options?)`, `.transform(fn)`, `.coerce()`. Anything that is not a Shared Modifier goes into `Schema`.

Every primitive and composite class (`StringSchema`, `NumberSchema`, `BooleanSchema`, `BigintSchema`, `ObjectSchema`, `ArraySchema`, `UnionSchema`, `LiteralSchema`, `EnumSchema`) extends `ChainableSchema`. A concrete subclass adds only its constructor, its `_checkType` (the type guard, plus every child on a composite), an optional `_coerceInput` override, and its Local Modifiers, built on the inherited `protected` helpers. It never adds a second copy of `"~standard"`, of a Shared Modifier or of the pipeline.

## Chained-instance-method API and the pipeline

Every Modifier is a method on the instance returning a schema, not a wrapping function or static combinator — `pvl.string().min(3).optional()`, not `pvl.optional(pvl.string().min(3))` ([ADR-0006](../../adr/0006-chained-instance-method-api-via-shared-base-schema-class.md)). Every class keeps its own type through every Modifier, primitives included, via its type-only `'~kind'` and `RetypedSchema<this, Input, Output>`; `.transform()` is the one exception (see [Transformation](#transformation)).

Each Modifier method builds one `Modifier` value (`src/modifiers.ts`) and appends it, on a clone, to one of two arrays through `_withPreModifier`/`_withPostModifier`:

| Modifier                                                             | Array                  | Tags                                              |
| -------------------------------------------------------------------- | ---------------------- | ------------------------------------------------- |
| `.optional()`, `.nullable()`                                         | pre                    | `SHORT_CIRCUIT`                                   |
| `.coerce()`                                                          | pre                    | none                                              |
| Constraints (`.min()`, `.max()`, `.length()`, `.int()`), `.refine()` | post                   | none                                              |
| `object`'s default strip, `.strict()`                                | post                   | none                                              |
| `.transform()`                                                       | post (always the last) | `REQUIRES_ALL_PASSED`, `RUNS_AFTER_SHORT_CIRCUIT` |

`_validate(value, path)` runs the pre-modifiers in chain order, then `_checkType`, then the post-modifiers in chain order, collecting every `Issue` ([ADR-0010](../../adr/0010-modifiers-run-in-chain-order-around-the-type-check.md) holds the six exact steps). An untagged `fn` result reads as: `null` continue, `{ issues }` collect and continue, `{ value }` replace and continue. The tags are the only departures: `SHORT_CIRCUIT` accepts the value and skips everything but `RUNS_AFTER_SHORT_CIRCUIT` steps; `REQUIRES_ALL_PASSED` skips a step once anything failed. A failed `_checkType` returns at once, so no post-modifier ever sees a wrongly typed value. A `fn` gets only `(value, path)`: a schema type whose post-modifier needs more than the current value keeps it itself (`object`, in [schema-types.md](./schema-types.md)).

```ts
pvl.string().min(1).max(100).optional();
pvl.number().int().nullable();
pvl.object({ name: pvl.string() }).strict();
pvl.object({ extra: pvl.string() }).passthrough();
```

- **One `Modifier` type for every Modifier.** A Modifier is a method that builds a `Modifier` literal and calls `_withPreModifier` (before the type check) or `_withPostModifier` (after it). Tag it with `MODIFIER_TAG` only where its behaviour departs from the default reading of its result, and give it a `shape` (the factory that built it) only where a later Modifier must remove it through `_withoutModifiers`.

## Custom messages only on Modifiers that report an `Issue`

No factory and no schema constructor takes options; every type-check message is a fixed default ([ADR-0019](../../adr/0019-factories-take-no-options.md)). A trailing `{ message }` (`IssueEditableProps`) exists only on the Modifiers that report an `Issue` of their own — the Constraints, `.refine()` and `object`'s `.strict()` — and is the only custom-message mechanism; there is no global error map in v1.

```ts
pvl.string().min(3, { message: 'must be at least 3 characters' });
pvl.number().refine((value) => value % 2 === 0, { message: 'must be even' });
pvl.object({ name: pvl.string() }).strict({ message: 'no extra keys' });
```

## Refinements, Transforms, Coercion

All three are supported in v1 (`GLOSSARY.md` has the precise distinction), and each runs where it is chained:

- **Refinement**: `(data) => boolean` predicates attached via `.refine(predicate, options?)`, a post-modifier. Never change the value; a failing Refinement produces a `CUSTOM` `Issue`, never throws, and does not stop the post-modifiers after it. Skipped for a value `.optional()`/`.nullable()` short-circuited.
- **Coercion**: opt-in conversion of the raw input via `.coerce()`, a pre-modifier replacing the value **before** the type check, so a coerced value is checked like any other and a coercion never produces an `Issue` of its own. Its position against `.optional()`/`.nullable()` matters: `pvl.string().coerce().optional()` turns `undefined` into `'undefined'`, `pvl.string().optional().coerce()` keeps it. A no-op (identity `_coerceInput`) on `object`, `array`, `union` and `enum`.
- **Transform**: see [Transformation](#transformation) below.

## Transformation

`.transform(fn)` converts an accepted value into a different `Output`. It ends the chain: it returns a plain `Schema<Input, ReturnType<fn>>` (`validate()` and `~standard` only, no `shape`/`element`), so every other Modifier is chained before it ([ADR-0016](../../adr/0016-transform-and-compile-end-the-modifier-chain.md)). It is therefore always the last post-modifier, and the last thing to run: tagged `REQUIRES_ALL_PASSED`, it runs only if nothing failed, and tagged `RUNS_AFTER_SHORT_CIRCUIT`, it still runs after `.optional()`/`.nullable()` accepted the value — so `fn`'s parameter type includes `undefined`/`null` once those are chained.
