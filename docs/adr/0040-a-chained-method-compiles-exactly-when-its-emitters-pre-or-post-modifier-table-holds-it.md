# A chained method compiles exactly when its Emitter's pre- or post-modifier table holds it

**An Emitter has two tables, split the way a Schema splits its calls. `preModifierSteps` holds a method for each of `preModifierCalls` and `postModifierSteps` one for each of `postModifierCalls`. Each method writes that Modifier's step, or `undefined` when it writes nothing. Every chained method that compiles is a method in one of the two tables, so the base `Emitter.compilesMethod` reads only them, with `Object.hasOwn`, and no Emitter overrides it.** This amends [ADR-0033](./0033-an-emitter-dispatches-chained-methods-through-typed-method-tables.md), whose tables held only what writes a short-circuit condition or a check, and [ADR-0035](./0035-modifiers-compile-to-calls-to-the-users-own-functions-typed-at-their-place-in-the-chain.md), which gave `.coerce()` and `.transform()` a hook each.

```ts
class ChainableSchemaEmitter extends Emitter {
  static override readonly preModifierSteps = {
    ...Emitter.preModifierSteps,
    optional,
    nullable,
    coerce,
  } satisfies PreModifierStepTable;
  static override readonly postModifierSteps = {
    ...Emitter.postModifierSteps,
    refine,
    transform,
  } satisfies PostModifierStepTable;
}

class ObjectSchemaEmitter extends ChainableSchemaEmitter {
  static override readonly postModifierSteps = {
    ...ChainableSchemaEmitter.postModifierSteps,
    strict,
    passthrough,
  } satisfies PostModifierStepTable<ObjectSchema>;
}
```

Four methods compiled without being in a table, so two Emitters overrode `compilesMethod` to name them by their enums. `ChainableSchemaEmitter` named `.coerce()` and `.transform()`, which the `_emitCoercion` and `_emitTransform` hooks wrote. `ObjectSchemaEmitter` named `.strict()`, which `_emitPostModifierChecks` built per Schema and added to a copy of its table, and `.passthrough()`, which writes nothing. `_emitPreModifierSteps` also checked `call.name` against `COERCE` to choose between the table and the hook. The tables didn't match the Schema's split either: `shortCircuitConditions` held every pre-modifier but `.coerce()`, and the Schema kept `.transform()` out of `calls` in a `transformCall` of its own. `@pcvl/schema` has no such special cases. `.coerce()` is a pre-modifier calling `_coerceInput`, the identity on the base class. `.transform()` is a post-modifier whose tags make it run apart. `.strict()` builds a post-modifier closing over its shape's keys, and `.passthrough()` adds none.

Each of those is now a method in a table:

- **A method reads its Schema and its composite's locals, as well as its target and arguments.** It is handed `{ schema, target, schemaTarget, compositeLocals, args }` (`EmitterMethodInput`). `target` is what it checks, which is a composite's output local for its post-modifiers. `schemaTarget` is the Schema's own target. `compositeLocals` is `undefined` for a pre-modifier and for a Schema that isn't a composite. `EmitterMethodOf` takes the Schema subclass a method reads as a third type parameter, defaulting to `never` for a method that reads none. A table can be typed by the subclass its Emitter compiles (`PostModifierStepTable<ObjectSchema>`). It holds its methods as methods, whose parameter TypeScript compares both ways, so a subclass's table stays assignable to the base table's type. The compiler trusts a Schema's Emitter to be handed its own Schema subclass, as it trusts a call's arguments to be what the method declares ([ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)): every Schema names its Emitter.
- **A step is an object naming its kind.** A pre-modifier writes `{ shortCircuitCondition }` or `{ coercion }` (`EmittedPreModifierStep`), and a post-modifier `{ check }` or `{ transform }` (`EmittedPostModifierStep`). The brands are strings, so nothing at runtime tells them apart. The key does. Every Constraint and `.refine()` therefore returns `{ check: emitCheck(…) }`, not the bare check.
- **`.coerce()` is a pre-modifier, the identity unless the Emitter's table says otherwise.** `ChainableSchemaEmitter`'s `coerce` returns `undefined`, which an object, an array and an enum keep. Each primitive's Emitter puts its conversion in its own table. A literal's reads `schema.value`, the reason ADR-0035 gave `.coerce()` a hook, since a table method then saw only its target and arguments.
- **`.transform()` is a post-modifier in `Schema.calls`.** Reading a Schema no longer splits it off, so `transformCall` and `chainedCalls` are gone, and `getTransformFunction()` finds it by name. Its method writes at `schemaTarget`: the Frame runs it once a composite's output has been handed back onto the value. `Emitter.emitPostModifierSteps` sets its step apart in `SchemaParts.transform`, as `@pcvl/schema`'s tags set it apart, so the Frame doesn't change. A chain holds at most one, always last ([ADR-0016](./0016-transform-and-compile-end-the-modifier-chain.md)).
- **`.strict()` is a static method of the object's table.** It reads the shape's keys from `schema` and the object's `input` and path from `compositeLocals`. Its target stays a plain `CheckingTarget`, so the reason ADR-0033 gave for keeping it out of the table no longer holds.
- **`.passthrough()` writes nothing.** `ObjectSchema.postModifierCalls` now leaves out only the `.strict()` calls that lose. `readsUnknownKeysAfterStrict` decides whether a winning `.strict()` copies the unknown keys onto the output. It holds when a post-modifier besides `.strict()`, `.passthrough()` and `.transform()` reads the output. A `.transform()` runs only once `.strict()` has passed, so by then no unknown key is left to copy.
- **Dispatch is not a hook.** `emitPreModifierSteps` and `emitPostModifierSteps` replace `_emitPreModifierSteps` and `_emitPostModifierChecks`. Nothing overrides them any longer, so they lose the `_` that invites an override. `_emitSchemaParts` calls both, and each leaves out a method's `undefined`. `_emitCoercion`, `_emitTransform` and both `compilesMethod` overrides are gone.

The emitted output is unchanged, so the inline snapshots don't change.

## Considered options

- **Keep the two `compilesMethod` overrides, which list what the hooks emit.** Rejected: they repeat in enums what the Schema's own split already says, and every new method a hook emits must be added to them as well.
- **Fold only `.coerce()` into the pre-modifier table.** Rejected: `.transform()`, `.strict()` and `.passthrough()` would still be named by an override, for reasons `@pcvl/schema` doesn't have.
- **A third table holding only `.transform()`.** Rejected: `@pcvl/schema` runs it from the same list as the other post-modifiers, so a table of its own would copy the compiler's special case without a reason for it.
- **The Frame places the post-modifier steps by their kind, so `SchemaParts.transform` goes.** Rejected: it moves the tags' handling into the Frame without changing the emitted output, as a transform is always last.
- **`.passthrough()` as a method that writes nothing, with `postModifierCalls` still leaving it out.** Rejected: the method would exist only for `compilesMethod` to find and would never be dispatched.
- **`readsUnknownKeysAfterStrict` counts only `.refine()`**, the one other post-modifier an object has. Rejected: a later object Constraint that reads the output would need the copy too, and it would be skipped without a sign.
- **Keep the dispatch as `_` hooks, or inline it into `_emitSchemaParts`.** Rejected: nothing overrides it, and a named method keeps setting the transform apart in one place.
