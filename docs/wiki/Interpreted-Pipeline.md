# Interpreted pipeline

How every interpreted [Schema](./Concepts.md#schema) validates. Every schema page links here for the shared part and only adds what its own schema does.

## The short version

An interpreted Schema holds two lists of steps: the [pre-modifiers](./Concepts.md#pre-modifier-and-post-modifier) and the post-modifiers. Validating runs the pre-modifiers, then the [type check](./Concepts.md#type-check), then the post-modifiers, each list in the order the [Modifiers](./Concepts.md#modifier) were chained, and collects every [Issue](./Concepts.md#issue) on the way.

```mermaid
flowchart LR
    V["value"] --> PRE["pre-modifiers<br/>.optional() .nullable() .coerce()"]
    PRE --> TC["type check<br/>_checkType"]
    TC --> POST["post-modifiers<br/>Constraints, .refine(), .strict(), .transform()"]
    POST --> R["Result"]
```

## Building a Schema

Every factory (`pvl.string()`) builds an object of its schema's class (`StringInterpretedSchema`). Every class extends `ChainableInterpretedSchema`, which adds the five [Shared Modifiers](./Concepts.md#shared-modifier-and-local-modifier), and that extends `InterpretedSchema`, which owns the pipeline.

```mermaid
classDiagram
    class Schema {
        <<interface>>
        validate(value)
        _validate(value, path)
        standalone()
    }
    class InterpretedSchema {
        <<abstract>>
        _preModifiers
        _postModifiers
        validate(value)
        _validate(value, path)
        _checkType(value, path)*
        _coerceInput(value)
        _withPreModifier(modifier)
        _withPostModifier(modifier)
        _withoutModifiers(shapes)
    }
    class ChainableInterpretedSchema {
        <<abstract>>
        optional()
        nullable()
        coerce()
        refine(predicate, options)
        transform(fn)
    }
    Schema <|.. InterpretedSchema
    InterpretedSchema <|-- ChainableInterpretedSchema
    ChainableInterpretedSchema <|-- StringInterpretedSchema
    ChainableInterpretedSchema <|-- NumberInterpretedSchema
    ChainableInterpretedSchema <|-- ObjectInterpretedSchema
    ChainableInterpretedSchema <|-- ArrayInterpretedSchema
    ChainableInterpretedSchema <|-- UnionInterpretedSchema
    ChainableInterpretedSchema <|-- OtherSchemas
    class OtherSchemas["Bigint, Boolean, Literal, Enum…InterpretedSchema"]
```

Each Modifier method builds one step, a `Modifier` value holding a function `fn(value, path)`, and returns a **copy** of the Schema with that step appended to one of the two lists (`_withPreModifier` or `_withPostModifier`). The Schema it was called on is never changed, so one Schema can be reused as the start of many chains.

```mermaid
flowchart LR
    A["pvl.string()<br/>pre: []<br/>post: []"] -- ".min(3)" --> B["copy<br/>pre: []<br/>post: [min 3]"]
    B -- ".optional()" --> C["copy<br/>pre: [optional]<br/>post: [min 3]"]
    C -- ".refine(fn)" --> D["copy<br/>pre: [optional]<br/>post: [min 3, refine]"]
```

The order of the two lists is the chain order, and the two lists are separate, so a pre-modifier always runs before a post-modifier, wherever it was chained: `pvl.string().min(3).optional()` and `pvl.string().optional().min(3)` validate alike.

## Running a Schema

`validate(value)` calls `_validate(value, [])`, the empty array being the path of the top-level value. A Schema nested in another one is called through `_validate` too, with the parent's path extended by the field's key or the element's index.

```mermaid
flowchart TD
    START["validate(value)"] --> VAL["_validate(value, path = [])"]
    VAL --> PRE["_runPreModifiers: take the next pre-modifier,<br/>in chain order"]
    PRE --> PREMORE{"a pre-modifier left?"}
    PREMORE -- yes --> PREFN["result = fn(value, path)"]
    PREFN --> PRERES{"result?"}
    PRERES -- "null" --> PRE
    PRERES -- "{ issues }" --> PRECOLLECT["collect the Issues"] --> PRE
    PRERES -- "{ value }" --> PREREPLACE["replace the value"]
    PREREPLACE --> SC{"tagged SHORT_CIRCUIT?"}
    SC -- no --> PRE
    SC -- "yes: .optional() / .nullable()<br/>accepted the value" --> POST
    PREMORE -- no --> TC["_checkType(value, path)"]
    TC --> TCRES{"type check passed?"}
    TCRES -- no --> FAIL["return { issues }<br/>no post-modifier runs"]
    TCRES -- "yes: value = its output" --> POST["_runPostModifiers: take the next post-modifier,<br/>in chain order"]
    POST --> POSTMORE{"a post-modifier left?"}
    POSTMORE -- no --> END{"any Issue collected?"}
    END -- yes --> RI["return { issues }"]
    END -- no --> RV["return { value }"]
    POSTMORE -- yes --> SKIP1{"short-circuited and not tagged<br/>RUNS_AFTER_SHORT_CIRCUIT?"}
    SKIP1 -- "yes: skip it" --> POST
    SKIP1 -- no --> SKIP2{"an Issue collected and tagged<br/>REQUIRES_ALL_PASSED?"}
    SKIP2 -- "yes: skip it" --> POST
    SKIP2 -- no --> POSTFN["result = fn(value, path)"]
    POSTFN --> POSTRES{"result?"}
    POSTRES -- "null" --> POST
    POSTRES -- "{ issues }" --> POSTCOLLECT["collect the Issues"] --> POST
    POSTRES -- "{ value }" --> POSTREPLACE["replace the value"] --> POST
```

The rules the graph follows:

- **A step's result** reads the same everywhere: `null` means "fine, go on", `{ issues }` means "collect these and go on", `{ value }` means "go on with this value instead".
- **A failed type check returns at once.** No post-modifier ever sees a value of the wrong type, so a `.min(3)` never has to ask whether its value is a string.
- **Every other failure is collected, not returned.** A failing `.min(3)` doesn't stop a `.refine()` after it, so one run reports every problem.
- **Tags** are the only exceptions to those rules:

| Tag                        | Carried by                   | Effect                                                                                          |
| -------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `SHORT_CIRCUIT`            | `.optional()`, `.nullable()` | Its `{ value }` accepts the value: the rest of the pre-modifiers and the type check are skipped |
| `RUNS_AFTER_SHORT_CIRCUIT` | `.transform()`               | Still runs after a short-circuit, while every other post-modifier is skipped                    |
| `REQUIRES_ALL_PASSED`      | `.transform()`               | Skipped once any Issue has been collected                                                       |

## A Schema that holds others

An object, an array or a union validates the Schemas it holds inside its own type check, by calling each one's `_validate` with an extended path. Each child runs its own full pipeline there.

```mermaid
flowchart TD
    P["object _validate(value, path)"] --> PPRE["the object's pre-modifiers"]
    PPRE --> PTC["the object's _checkType"]
    PTC --> C1["field 'name': _validate(value.name, [...path, 'name'])<br/>its own pre-modifiers, type check, post-modifiers"]
    PTC --> C2["field 'age': _validate(value.age, [...path, 'age'])<br/>its own pre-modifiers, type check, post-modifiers"]
    C1 --> COL["every field's Issues collected"]
    C2 --> COL
    COL --> OK{"every field passed?"}
    OK -- no --> F["return { issues }"]
    OK -- yes --> PPOST["the object's post-modifiers,<br/>reading the output the fields built"]
```

That is the cost the compiler removes: every nested Schema is a separate object with its own lists and function calls, walked on every validation.

## Source

- [`interpretedSchema.ts`](../../packages/schema/src/schemas/interpretedSchema.ts): `validate`, `_validate`, `_runPreModifiers`, `_runPostModifiers`, `_withPreModifier`, `_withPostModifier`, `_withoutModifiers`
- [`chainableInterpretedSchema.ts`](../../packages/schema/src/schemas/chainableInterpretedSchema.ts): the five Shared Modifiers
- [`modifiers/modifiers.ts`](../../packages/schema/src/modifiers/modifiers.ts): the `Modifier` type
- [`modifiers/enums.ts`](../../packages/schema/src/modifiers/enums.ts): `MODIFIER_TAG`
- [`pvl.ts`](../../packages/schema/src/pvl.ts): the factories

Further reading: [pipeline.md](../specification/schema/pipeline.md), [ADR-0010](../adr/0010-modifiers-run-in-chain-order-around-the-type-check.md).
