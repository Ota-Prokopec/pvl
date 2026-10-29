# `.coerce()` is a Local Modifier of the primitives and `literal`

**Only `string`, `number`, `boolean`, `bigint` and `literal` have `.coerce()`. Each declares its own, which calls `_withPreModifier` with its conversion from `src/coercions.ts`. `object`, `array`, `union` and `enum` have none, so `ChainableInterpretedSchema` holds four Shared Modifiers, and `InterpretedSchema` no longer has `_coerceInput`. The compiler follows: `ChainableSchemaEmitter`'s `preModifierSteps` loses `coerce`, which only the primitive and literal Emitters hold.** This amends [ADR-0006](./0006-chained-instance-method-api-via-shared-base-schema-class.md) and [ADR-0020](./0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md), which put `.coerce()` on the shared base class and `_coerceInput` beneath it, and [ADR-0040](./0040-a-chained-method-compiles-exactly-when-its-emitters-pre-or-post-modifier-table-holds-it.md), whose `ChainableSchemaEmitter` held `.coerce()` as the identity.

```ts
class NumberInterpretedSchema<Input = number, Output = number> extends ChainableInterpretedSchema<
  Input,
  Output
> {
  coerce(): RetypedSchema<this, unknown, Output> {
    return this._withPreModifier<unknown, unknown>({
      fn: (value) => {
        return { value: coerceToNumber(value) };
      },
    }) as unknown as RetypedSchema<this, unknown, Output>;
  }
}

pvl.number().coerce(); // a pre-modifier converting with `Number()`
pvl.object({}).coerce(); // a type error: an object has no `.coerce()`
```

`.coerce()` was on every Schema, but on an object, an array, a union and an enum it was the identity, since none of them has one type to convert to. It still made the Input `unknown`, so `pvl.object({}).coerce()` typed a Schema that accepted only objects as accepting anything, and a user chaining it got nothing for it. The compiler had to keep an identity `coerce` in `ChainableSchemaEmitter` only so that `compilesMethod` found it.

- **A Local Modifier is one a Schema defines on its own class**, so not every Chainable Schema offers it. `.coerce()` is one on five classes, as `.min()` is on four. Each class's `coerce()` has its own documentation saying what it converts, in place of one comment explaining where it does nothing.
- **Each `coerce()` calls `_withPreModifier` directly**, with the same `RetypedSchema` cast `.optional()` and `.nullable()` use. No helper wraps the five calls. A literal picks its conversion by the type of its value, as `_coerceInput` did.
- **The compiler's "Input becomes `unknown`" rule stays in `ChainableSchemaEmitter._spellTypes`.** It reads the chain by name, as `_spellParameterTypes` does for `.refine()` and `.transform()`. Only a Schema that offers `.coerce()` can have such a call, and the tables still decide what compiles.
- **`.coerce()` on an object, an array or an enum is a method its Emitter doesn't hold.** `PvlSchemaMethodName` still names `coerce`, as the primitives' classes have it, so the compiler reports `UNSUPPORTED_SCHEMA`, as it does for `.strict()` on a string ([ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)).

Both packages are unreleased (`0.0.0`), so removing the method breaks no user.

## Considered options

- **Keep `.coerce()` shared, as the identity on the composites and `enum`.** Rejected: it does nothing there but widen the Input to `unknown`.
- **Drop `.coerce()` only from the compiler's `ChainableSchemaEmitter`.** Rejected: the compiler would reject `pvl.object({}).coerce()`, which `@pcvl/schema` accepts and runs.
- **Keep it shared, and have the compiler warn that it does nothing on a composite.** Rejected: the warning would describe a method that shouldn't exist.
- **Give `enum` a conversion to the member an input matches.** Rejected for now: a source may mix string and number members, so `'1'` matches two members when `'1'` and `1` both are. It can be its own feature.
- **An intermediate `CoercibleInterpretedSchema` holding `coerce()` over an abstract `_coerceInput`.** Rejected: it adds a third kind of Modifier beside Shared and Local, and a class level the compiler would be tempted to mirror, to save five three-line methods.
- **A protected `_withCoercion(convert)` helper the five `coerce()` methods call.** Rejected: it wraps one `_withPreModifier` call and its cast, which `.optional()` and `.nullable()` already write out.
- **Keep `_coerceInput` on `InterpretedSchema`, with each `coerce()` calling it.** Rejected: the base class would keep a hook that only five subclasses use.
