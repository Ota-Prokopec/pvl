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

- **Two tables are dispatched, both at a plain `CheckingTarget`.** `shortCircuitConditions` holds the pre-modifiers (`EmitterMethodTable<EmittedShortCircuitCondition>`), and `postModifierChecks` the post-modifiers that check the value (`EmitterMethodTable<EmittedCheck>`). The base `Emitter` declares both empty. `ChainableSchemaEmitter` adds `.optional()` and `.nullable()`, and each schema's Emitter adds its Constraints. `_emitShortCircuitConditions` and `_emitPostModifierChecks` dispatch through them with `emitMethodCall({ table, call, target, emitterName })` (`src/emitters/utils/methodCall.ts`), whose result is typed by the table, so nothing is cast back.
- **`.strict()` is a post-modifier built per Schema, and `.passthrough()` adds none, as in `ObjectInterpretedSchema`.** Only the last of them chained has an effect, so `ObjectSchema.postModifierCalls` leaves out every `.strict()` and `.passthrough()` but a winning `.strict()`, as the interpreted one removes them. `.strict()` closes over the keys the shape declares and the object's `input` and path locals (`createStrictCheck`), as the interpreted one does over its shape's keys, so it is a method at a plain `CheckingTarget`: `ObjectSchemaEmitter._emitPostModifierChecks` dispatches through `{ ...this.postModifierChecks, strict }`. `.passthrough()` only removes the strip, so `_emitCompositeParts` copies the undeclared keys onto the output when it wins, or when a winning `.strict()` has another post-modifier reading them, as `_checkType` keeps them. `ObjectSchemaEmitter` overrides `compilesMethod` to name both.
- **What compiles is what a table holds, or what an emitter's `compilesMethod` names itself.** `Schema.findUncompilableDiagnostics` asks `emitter.compilesMethod({ name })`. A leading `_` means nothing to dispatch: a hook simply isn't in a table. A method emitted outside the static tables is named by its emitter's `compilesMethod` override instead, as `ObjectSchemaEmitter` names `.strict()`, built per Schema, and `.passthrough()`, which has no method (`UNKNOWN_KEYS_METHOD_NAMES`). `Object.hasOwn` reads only own keys, so a name every object has (`toString`, `__proto__`) is never a method. `.refine()`, `.coerce()` and `.transform()` are in no table, so they are still `UNSUPPORTED_SCHEMA`.
- **Each brand is made in one place, where its text is written.** `emitCheck` writes every `EmittedCheck`. With an optional `loopHead`, it also writes `.strict()`'s check of each key. Its siblings in `src/emitters/utils/emittedText.ts` each write one other kind: `emitShortCircuitCondition`, `emitOutputStatement` and `emitVariableDeclaration`. `EmittedIssue` is written in `issue.ts`. No dispatched method's result is cast.
- **A blank line is the Frame's formatting.** `CompositeParts.setsChildrenApart` asks the Frame to set the children's checks apart with a blank line before, between and after them, as an object's fields are. An array's one loop isn't set apart. Neither `''` posing as a declaration nor a field's trailing `''` remains.

**A call's arguments are trusted, in one place.** A table reads its methods' `args` as `never`, since each method keeps the `@pvl/schema` method's own parameters (`EmitterMethodOf`). `readCallArguments(call)` hands a call's arguments on, typed `never`. The compiler checks syntax, not types ([ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)), so the arguments read from source are what the application's own type check holds them to be. That is the one cast left on the dispatch path, and it is a cast of arguments, never of results.

The emitted output is byte-identical, so the inline snapshots don't change.

## Considered options

- **`.strict()` in `ObjectSchemaEmitter.postModifierChecks`, at `ObjectCheckingTarget`.** Rejected: a static member a subclass overrides must keep the type its base class declares. So `ObjectSchemaEmitter.postModifierChecks` can't read a wider target than the `CheckingTarget` the base dispatches with. A base table typed loosely enough to allow it would let the base dispatch `.strict()` with a plain target again. A `.strict()` closed over the object's keys reads no wider target, so it sits in the table the object dispatches its post-modifiers through.
- **`.strict()` and `.passthrough()` in tables of their own kind at `ObjectCheckingTarget` (`keyChecks`, `outputStatements`), called directly.** Replaced: it kept `.strict()` apart from the post-modifiers the interpreted one runs it with, and gave `.passthrough()` a method the interpreted one doesn't have.
- **`.passthrough()` in `postModifierChecks`, writing the copy.** Rejected: the copy is an output statement, not a check, and it must run where the strip would, before every other post-modifier, rather than where it is chained, which would move it behind the post-modifiers' gate and change the emitted code.
- **One `unknownKeysMethods` table holding both `.strict()` and `.passthrough()`.** Rejected: it would hold a check and an output statement together, so no one brand could type it.
- **A table keyed by method name that maps to the method and its kind.** Rejected: the kind would be a runtime tag, and the result's brand would again be restored from it by a cast.
- **Check each argument read from source against the method's parameters.** Rejected for now: it would duplicate the application's type check, which ADR-0024 leaves to the application.
- **Keep the methods as static members, and list them by name in each table.** Rejected: each method would be written twice, as a member and as a table entry. A static member also looks dispatchable to a reader, though it isn't.

> Amended by [ADR-0040](./0040-a-chained-method-compiles-exactly-when-its-emitters-pre-or-post-modifier-table-holds-it.md): the two tables are `preModifierSteps` and `postModifierSteps`, split as a Schema splits its calls. Each method writes its Modifier's step (`{ check }`, `{ shortCircuitCondition }`, …), or `undefined` when it writes nothing, and reads its Schema and its composite's locals as well as its target and arguments. `.coerce()`, `.refine()` and `.transform()` are methods of `ChainableSchemaEmitter`'s tables. `.strict()` is a static method of the object's table at a plain `CheckingTarget`, the option rejected below, and `.passthrough()` writes nothing, so `ObjectSchema.postModifierCalls` leaves out only the `.strict()` calls that lose. No Emitter overrides `compilesMethod` any longer.
