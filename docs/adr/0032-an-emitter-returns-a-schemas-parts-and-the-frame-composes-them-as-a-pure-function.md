# An Emitter returns a Schema's parts, and the Frame composes them as a pure function

**An Emitter's `_emitSchemaParts` returns every part of a Schema's checks as one typed value, `SchemaParts`, and the Frame's static functions compose it: `Frame.composeChecks({ target, parts })` where a parent reads the value, `Frame.composeSchema({ …, parts })` at the root.** A Schema is a composite exactly when its parts have `composite` parts. This amends [ADR-0027](./0027-the-frame-composes-emitters-emit-and-the-root-frame-writes-the-compiled-schema.md), whose Frame was a builder the Emitter set each part on, and [ADR-0028](./0028-emitter-methods-return-source-text-only.md), whose `buildFrame` set the parts the hooks emitted on that builder.

```ts
type SchemaParts = {
  baseCheck: EmittedCheck;
  shortCircuitConditions: EmittedShortCircuitCondition[];
  postModifierChecks: EmittedCheck[];
  composite?: {
    locals: CompositeLocals; // input1, output1, index1, element1, path1, issueCount1
    declarations: EmittedVariableDeclaration[];
    childChecks: string[];
    outputStatements: EmittedOutputStatement[];
  };
};
```

The builder's misuse was caught only at runtime. `setBaseCheck` overwrote silently, and `composeChecks` threw when it was never called. The base `Emitter._emitBaseCheck` threw for an Emitter that didn't override it, `Emitter._addCompositeParts` threw for a composite's Emitter that didn't override it, and reading a local of a Schema that isn't a composite threw. Being a composite was declared three times: `_isComposite()`, `_spellValueDeclaration()` and the `isComposite` option passed to the Frame. And `Emitter.emitDeclarations` declared `issueCount1` when there were post-modifiers' checks, while the Frame gated them on `issueCount1` under the same condition, so two classes had to agree on one rule.

Each of those is now a type, or has gone:

- **The base `Emitter._emitSchemaParts` returns a Schema's parts** with no `composite` parts: its base check, its pre-modifiers' short-circuit conditions (`_emitShortCircuitConditions`) and its post-modifiers' checks (`_emitPostModifierChecks`), two hooks of the same shape, each emitting one call's text at the Schema's target. A composite's Emitter overrides it. It takes its locals from `Scope` (`scope.nextCompositeLocals()`) before it names its fields or emits its children's parts, so the numbering is unchanged, and returns them in its `composite` parts. `ObjectSchemaEmitter` writes its `.strict()` check there instead of overriding `_emitPostModifierChecks`, as that check reads its locals. `_addCompositeParts`, `_isComposite`, `_spellValueDeclaration`, `emitPostModifierCheck`, `emitDeclarations`, `emitOutputHandoff`, `buildFrame` and `emitSchemaChecks` are gone.
- **A parent inlines its child's checks through the child's Emitter.** `emitNestedSchemaChecks`, which replaces `emitSchemaChecks`, emits the child's parts at the target its parent hands on, declares its value from the child's parts (`let` for a composite, as the Frame puts the output back on it), and inlines `Frame.composeChecks({ target, parts })`.
- **The Frame declares the locals it decides on.** It declares `issueCount1` when it gates post-modifiers' checks on it. It declares `path1` when the composite has any checks under its base check, its children's or its post-modifiers': the path local is there to report Issues under the composite, and only a check pushes an Issue, never a declaration or an output statement. A child's path extends it, and `.strict()` reports each unknown key at `[...path1, key]`. It also writes the output's handoff (`field0 = output2;`). Its own declarations come before the Emitter's, as before.
- **A missing base check is a type error.** TypeScript has no abstract static method, so a type stands in for one: `SchemaEmitter`, the type of `Schema.emitter`, is `typeof Emitter` plus `_emitBaseCheck`. The base methods that emit a Schema's parts, `_emitSchemaParts`, `emitNestedSchemaChecks` and `emitCompiledSchema`, take `this: SchemaEmitter`. `_emitBaseCheck` no longer takes `scope`, as no base check names a local. A Schema subclass that names an Emitter with no `_emitBaseCheck` fails the compiler's type check.
- **A composite that adds no parts can't be written.** `CompositeParts` requires every one of its fields, and a Schema without them simply isn't a composite, so no second declaration can disagree with it. An Emitter that should add them and doesn't compiles its Schema as a leaf, which the differential test catches, as it catches any other wrong check.
- **No Frame is built nested, so none can be wrapped in a class.** `composeSchema` composes the parts it is handed at `Frame.rootCheckingTarget`; `emitCompiledSchema`, its one caller, emits them there. Nothing in the types ties parts to the target they were emitted at, so `composeChecks` takes the target beside them, and a caller passes both from the same variable.

ADR-0028's rule that every `_emit` method returns source text bends for one hook: `_emitSchemaParts` returns an object of source text. ADR-0028 replaced `_emitTypedChecks`'s object of parts with a builder so that the Frame, not the Emitter, would place every gate. `SchemaParts` names each part, so the Frame still places every gate, and nothing needs to be set in order.

The emitted output is byte-identical, so the inline snapshots don't change.

## Considered options

- **Keep the builder, and make its setters check what they are given.** Rejected: a check runs only when a test reaches the misuse, while a type rejects it where it is written.
- **`SchemaParts` carries the target it was emitted at.** Rejected for now: it would tie `composeChecks`'s target to its parts, but not tie `composeSchema`'s parts to the root without a type of its own for the root's target, and every caller passes the two from one variable.
- **One `_emit…` hook per composite part, assembled by the base Emitter.** Rejected, as ADR-0028 rejected it: an object names its fields and its locals once, and its declarations, children, output and `.strict()` all read them.
- **The composite parts carry a `readsPath` flag for the Frame.** Rejected: the Emitter would decide on a local the Frame declares, which is the split between two classes this removes. The Frame's own rule over-declares only for a composite with no children and a post-modifier that reports nothing under its path, and no Emitter writes one.
- **The Frame tracks which locals the parts read.** Rejected: `CompositeLocals` would turn back into mutable state, and an object reads its path into `.strict()`'s target whether or not `.strict()` is chained, so every object would declare it.
- **The Emitter declares `path1` among its own declarations.** Rejected: the Frame's `issueCount1` sits between `path1` and the Emitter's declarations, so the emitted output would change.
- **Emitters as instances of an abstract class, so `_emitBaseCheck` is `abstract`.** Rejected for now: every Emitter is a class of static methods, which chained-method dispatch reads by name, so instances would change dispatch too, a decision of its own.

> Amended: the Frame also names the Issue counts its Gates compare with, after the value itself (`issueCountBeforeField0Validation`, `issueCountBeforeField0ChildrenValidation`), so neither `.transform()`'s part nor a composite's locals carry one. `_emitTransform` returns the call alone, and `Scope` no longer numbers an `issueCount`.
