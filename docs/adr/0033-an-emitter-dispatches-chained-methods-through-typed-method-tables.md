# An Emitter dispatches chained methods through typed method tables

**An Emitter holds the methods mirroring its Schema's in explicit tables, one per kind of text they write, each typed by that text's brand and spread from the table of the Emitter it extends.** A chained method compiles exactly when a table holds a method of its name, looked up with `Object.hasOwn`. This amends [ADR-0023](./0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md), whose compiler dispatched a chained method "to the emitter method of the same name", a static method found by reflection.

```ts
const min: EmitterMethodOf<StringInterpretedSchema['min']> = ({ target, args: [minLength, options] }) => emitCheck({ … });

class StringSchemaEmitter extends ChainableSchemaEmitter {
  static override readonly postModifierChecks = {
    ...ChainableSchemaEmitter.postModifierChecks,
    min,
    max,
    length,
  } satisfies PostModifierCheckTable;
}
```

Reflection had four problems. `Emitter.findEmittingMethod` walked the Emitters' prototypes with `Object.getOwnPropertyDescriptor`. A leading `_` decided which static method wasn't a mirrored one, and the base `Emitter`'s own methods were left out by convention. Its `EmittingMethod` type erased every method's arguments and result to `string`, so each caller cast the result back to the brand it expected. A short-circuit condition could therefore be cast as a check. `.strict()` declared an `ObjectCheckingTarget`, but the dispatcher accepted a plain `CheckingTarget`. And the brands were made by about 17 `as` casts, one of them passing `''` off as a declaration.

Each of those is now a type, or has gone:

- **Two tables are dispatched, both at a plain `CheckingTarget`.** `shortCircuitConditions` holds the pre-modifiers (`EmitterMethodTable<EmittedShortCircuitCondition>`), and `postModifierChecks` the post-modifiers that check the value (`EmitterMethodTable<EmittedCheck>`). The base `Emitter` declares both empty. `ChainableSchemaEmitter` adds `.optional()` and `.nullable()`, and each schema's Emitter adds its Constraints. `_emitShortCircuitConditions` and `_emitPostModifierChecks` dispatch through them with `emitMethodCall({ table, call, target })`, whose result is typed by the table, so nothing is cast back.
- **`.strict()` and `.passthrough()` are called directly.** They read an object's keys rather than its value, and only the last of them chained has an effect, so `ObjectSchemaEmitter._emitSchemaParts` already picks the one that wins. It calls that one from a table of its own kind typed at `ObjectCheckingTarget`: `keyChecks` holds `.strict()` (`EmitterMethodTable<EmittedCheck, ObjectCheckingTarget>`), and `outputStatements` holds `.passthrough()` (`EmitterMethodTable<EmittedOutputStatement, ObjectCheckingTarget>`). A table typed at `CheckingTarget` can't hold either, and calling `.strict()` with a plain `CheckingTarget` is a type error. `ObjectSchemaEmitter` overrides `compilesMethod` to read its two tables too.
- **What compiles is what a table holds.** `Schema.findUncompilableDiagnostics` asks `emitter.compilesMethod({ name })`. A leading `_` means nothing to dispatch: a hook simply isn't in a table. `Object.hasOwn` reads only own keys, so a name every object has (`toString`, `__proto__`) is never a method. `.refine()`, `.coerce()` and `.transform()` are in no table, so they are still `UNSUPPORTED_SCHEMA`.
- **Each brand is made in one place, where its text is written.** `emitCheck` writes every `EmittedCheck`. With an optional `loopHead`, it also writes `.strict()`'s check of each key. Its siblings in `emitterUtils.ts` each write one other kind: `emitShortCircuitCondition`, `emitOutputStatement` and `emitVariableDeclaration`. `EmittedIssue` is written in `issue.ts`. No dispatched method's result is cast.
- **A blank line is the Frame's formatting.** `CompositeParts.setsChildrenApart` asks the Frame to set the children's checks apart with a blank line before, between and after them, as an object's fields are. An array's one loop isn't set apart. Neither `''` posing as a declaration nor a field's trailing `''` remains.

**A call's arguments are trusted, in one place.** A table reads its methods' `args` as `never`, since each method keeps the `@pvl/schema` method's own parameters (`EmitterMethodOf`). `readCallArguments(call)` hands a call's arguments on, typed `never`. The compiler checks syntax, not types ([ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)), so the arguments read from source are what the application's own type check holds them to be. That is the one cast left on the dispatch path, and it is a cast of arguments, never of results.

The emitted output is byte-identical, so the inline snapshots don't change.

## Considered options

- **`.strict()` in `ObjectSchemaEmitter.postModifierChecks`, at `ObjectCheckingTarget`.** Rejected: a static member a subclass overrides must keep the type its base class declares. So `ObjectSchemaEmitter.postModifierChecks` can't read a wider target than the `CheckingTarget` the base dispatches with. A base table typed loosely enough to allow it would let the base dispatch `.strict()` with a plain target again. A table only `ObjectSchemaEmitter` declares has no such constraint, so its two methods sit in `keyChecks` and `outputStatements`.
- **One `unknownKeysMethods` table holding both `.strict()` and `.passthrough()`.** Rejected: it would hold a check and an output statement together, so no one brand could type it.
- **A table keyed by method name that maps to the method and its kind.** Rejected: the kind would be a runtime tag, and the result's brand would again be restored from it by a cast.
- **Check each argument read from source against the method's parameters.** Rejected for now: it would duplicate the application's type check, which ADR-0024 leaves to the application.
- **Keep the methods as static members, and list them by name in each table.** Rejected: each method would be written twice, as a member and as a table entry. A static member also looks dispatchable to a reader, though it isn't.
