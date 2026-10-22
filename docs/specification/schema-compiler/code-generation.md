# Code generation

What the code `@pvl/schema-compiler` emits looks like. Read this before you write or change an emit template.

## Everything inlined into one `_validate`

Straight-line JavaScript: literal `if`/`for` statements, no interpreter loop and no `new Function`. Every check of the whole Schema is inlined into one `_validate`, nested Schemas included. The parent never calls a child's `_validate`, for speed. Output therefore grows with the size of the whole tree ([ADR-0023](../../adr/0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md), superseding [ADR-0017](../../adr/0017-inline-with-delegation-code-generation.md)'s delegation).

A nested object or array is inlined where its parent reads it. Once its type check passes, its checks run in a block of their own, then the output they build replaces the value the parent read (`field0 = output1`), so a nested value is declared with `let`. Its locals are numbered across the whole class (`input1`, `path2`, `field3`, `index2`), and it keeps its path in one local (`const path2 = [...path1, "lines"]`) that its fields' and element's paths extend (`[...path2, index2]`). Without that local, every Issue path would spell out every key above it, and output would grow faster than the Schema with each level of depth. What only runs once every field or element has passed (`.strict()`, an array's Constraints) is guarded by the count of Issues before the node (`if (issues.length === issueCount1)`), because every node pushes onto the one `issues` array.

## Emitters mirror `@pvl/schema`'s methods

The templates live in `src/emitters/`, one class per schema type (`StringSchemaEmitter`, `ObjectSchemaEmitter`, …), with only static methods named like the schema method they compile, plus `_emitBaseCheck({ schema, target, scope })` for the type check, which reads `schema` only when the check needs the factory's argument (`pvl.literal('a')`). Every method of an emitter takes one object, never positional parameters, so a hook or template destructures only what it reads. A template takes `{ target, args }`: `target` is a `CheckingTarget` (the checked value, its path, and the full Issue path of an Issue about it, as expressions; the two hold the same array except at the root, where an empty path is reported as `undefined`) and `args` the mirrored method's own arguments. It returns source text written in a `js` tagged template ([ADR-0028](../../adr/0028-emitter-methods-return-source-text-only.md)): a pre-modifier's short-circuit condition, as an expression (`field0 === undefined`), or a post-modifier's statement, which for a Constraint is its check, written with `emitCheck({ failsWhen, issue })`. Each kind of text has its own branded string type in `src/types.ts` (`EmittedCheck`, `EmittedShortCircuitCondition`, `EmittedOutputStatement`, …), so one can't be passed where another belongs. Its type is `EmitterMethodOf<…>` of the `@pvl/schema` method it mirrors (`EmitterMethodOf<StringInterpretedSchema['min']>`), so its `args` are that method's own parameters, any of them a Runtime Argument, and a change to them fails the compiler's type check. An emitter whose methods take arguments also spells each parameter's type in `parameterTypes`, typed by the same methods (`ParameterTypesOf<StringInterpretedSchema>`), for the constructor a Runtime Argument is passed to. One whose Constraints' default messages name their first argument lists those messages in `argumentMessages` (`ArgumentMessagesOf<StringInterpretedSchema>`), which the constructor builds them from. The compiler dispatches a chained method to the emitter method of the same name, so adding a method to an emitter is what makes that method compile.

The emitters extend each other the way the schemas do. The abstract base `Emitter` stands in for `InterpretedSchema` and does the emitting, following the pipeline of [ADR-0010](../../adr/0010-modifiers-run-in-chain-order-around-the-type-check.md): a Schema's pre-modifiers' short-circuit conditions (`_emitShortCircuitConditions`) guard its base check (`_emitBaseCheck`, the type check), and its post-modifiers' checks (`_emitPostModifierChecks`) run once that has passed. Every method whose name starts with `emit` or `_emit` returns source text, a string or a list of them. A composite's emitter also adds its other parts to the frame (`_addCompositeParts`): its locals (`Emitter.emitDeclarations` writes the frame's own, `path1` and `issueCount1`, which come first), its children's checks, as `_checkType` runs every child, and the statements building its output. Its post-modifiers run only once every child has passed. An emitter whose post-modifiers don't all check its value overrides `_emitPostModifierChecks`, as an object emits only the last `.strict()`, which reads its keys, and one whose schema adds pre-modifiers of its own overrides `_emitShortCircuitConditions`. The calls come from the compiler `Schema`'s two arrays, `preModifierCalls` and `postModifierCalls`: reading a Schema splits its chained methods into them, each in chain order, as `@pvl/schema` adds a Modifier to its pre- or post-modifiers (`PRE_MODIFIER_NAMES`).

Emitters emit, and the Schema's `Frame` (`src/emitters/frame.ts`) only composes what they emit ([ADR-0027](../../adr/0027-the-frame-composes-emitters-emit-and-the-root-frame-writes-the-compiled-schema.md)). `emitSchemaChecks` writes one Schema's checks where its parent reads the value, and `emitCompiledSchema` writes them at the root, as the Compiled Schema's class expression: both go through `buildFrame`, so the root compiles exactly as a nested Schema does ([ADR-0031](../../adr/0031-the-root-schema-compiles-as-a-nested-one-under-one-closing-return.md)). It creates the Schema's frame at its target: `Frame.rootCheckingTarget` at the root, `_validate`'s own `value` and `path`, and nested, the one its parent hands on (`Frame.createNestedCheckingTarget`). It passes each part the hooks emit to its own setter (`setBaseCheck`, `addShortCircuitConditions`, `addPostModifierChecks`), lets a composite add the rest (`addDeclarations`, `addChildChecks`, `addOutputStatements`), and adds the output's handoff (`Emitter.emitOutputHandoff`) last among the output statements. `emitSchemaChecks` ends with the frame's `composeChecks()`. `emitCompiledSchema` ends with its `composeSchema(…)`, which is handed the class's name and types, wraps the same statements in the class expression, and closes `_validate` with its one return. The frame composes, in order, the declarations, the children's checks, the post-modifiers' checks behind their gate, and the output statements, then wraps them after the base check, then in the pre-modifiers' guard. It places every part the same way at the root as nested, along with the fixed fragments `emitterUtils.ts` and `issue.ts` write for it. A failed base check pushes its Issue, and the rest runs in its `else`, so it reads the value as the type the base check checked. The checks never return, at the root as nested, where a return would skip the parent's other fields, and a value a pre-modifier accepts skips every check and is left as it is. Post-modifiers run once the base check has passed, or once every child has for a composite: a composite runs them inside `if (issues.length === issueCount1)`, and a primitive writes them as they are, inside its base check's `else`. Each reports an Issue about the value itself at its target's `issuePath`, as the base check does. The output is handed on: a composite puts it back on its value (`field0 = output2`, or `value = output1` at the root), and any other value is left as it is. `_validate` then returns `{ issues }` when there are any, and otherwise `{ value }`. The frame also names a composite's locals (`input`, `output`, `index`, `element`, `path`, `issueCount`), numbered from `Scope` at the root as nested (`input1`, `path2`). Only a composite, whose checks build an output, declares locals, so a primitive's frame numbers nothing and has no locals to read.

A short-circuited root reads like a nested Schema: its pre-modifiers' conditions wrap its checks, and the closing return follows them.

```ts
if (!((value === undefined))) {
  if (typeof value !== "string") {
    issues.push(…);
  } else {
    if (value.length > 2) { issues.push(…); }
  }
}
return issues.length > 0 ? { issues } : { value };
```

`ChainableSchemaEmitter extends Emitter` adds `.optional()`/`.nullable()` and widens the types for them, and every schema's emitter extends it. A subclass overrides only the `_`-prefixed hooks: `_emitBaseCheck`, `_spellFactoryTypes` when its factory takes an argument (`pvl.literal('a')`) or nests Schemas, and, for a composite, `_addCompositeParts` and `_isComposite`; `_emitPostModifierChecks` is overridden only when a post-modifier doesn't check the value, and `_emitShortCircuitConditions` only to add pre-modifiers. Each hook takes the compiler `Schema` subclass its Emitter compiles (`ObjectSchemaEmitter._addCompositeParts({ schema, frame, scope, postModifierChecks }: AddCompositePartsArgs<ObjectSchema>)`), and a nested Schema's Emitter is the one it names (`schema.emitter`). `Scope` (`src/emitters/scope.ts`) carries what one class's emitting shares: the numbering of its locals. Neither a name starting with `_` nor a method the base `Emitter` declares is ever dispatched as a chained method. The compiler's abstract `Schema` (`src/schemas/schema.ts`) reads each factory into its own subclass (`src/schemas/`), which names its Emitter, and reports what can't be compiled yet ([ADR-0026](../../adr/0026-the-compiler-reads-each-factory-into-its-own-schema-subclass.md)).

An emitted Issue's message comes from `@pvl/schema`'s `<SCHEMA>_SCHEMA_ISSUE_MESSAGE`, called at compile time and written as a literal. A message that names a runtime value is a template literal around that message's literal text, which writes the value as the interpreted path's own template literal does (`emitMessageAroundValue` in `src/issue.ts`). `.strict()`'s names the unknown key, so it is built as its Issue is; one naming a Runtime Argument is built once, by the constructor (below). Issue options passed as a Runtime Argument are read when the Issue is built, as the interpreted path reads them (`emitConstraintIssue`).

## Each Compiled Schema is a class expression implementing `Schema`

Each `pvl.compile(...)` call is replaced, where it is written, by an instance of a class expression named `PvlCompiledSchema<n>` (counted in source order among the calls `Module` replaces), cast up to the type it implements ([ADR-0029](../../adr/0029-a-compiled-schema-is-a-class-expression-implementing-the-schema-type.md)):

```ts
export const code = (new (class PvlCompiledSchema0 implements PvlSchema<string, string> {
  declare readonly [PVL_SCHEMA_BRAND]: true;

  get "~standard"(): PvlStandardSchemaProps<string, string> {
    return { version: 1, vendor: "@pvl/schema", types: undefined, validate: (value: unknown) => this.validate(value) };
  }

  validate(value: unknown): PvlResult<string> {
    return this._validate(value, []) as PvlResult<string>;
  }

  _validate(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
    const issues: PvlIssue[] = [];
    …
    return issues.length > 0 ? { issues } : { value };
  }
})() as PvlSchema<string, string>);
```

The root's frame writes that expression, and `Module` writes it in place of the `pvl.compile(...)` expression, each line after the first indented to the line the call is on. A call inside another one's argument is compiled into that one, so only the outermost is replaced. The class implements `@pvl/schema`'s `Schema` type and extends no class: `@pvl/schema`'s `Issue`, `Result`, `Schema`, `SCHEMA_BRAND` and `StandardSchemaProps` come in through one type-only import, aliased so they can't clash with the module's own names. Its name is visible only inside its own body, so it never clashes either. It declares the interface's brand, writes `"~standard"`, reporting `vendor: "@pvl/schema"` ([`standard-schema.md`](../standard-schema.md#conformance-rules)), and `validate`, which calls `_validate` at the root and casts its Result, and its `_validate` is the generated code. Its `Input` and `Output` type arguments are spelled out from the Schema, and the cast keeps the call site's type exactly what `pvl.compile()` returns. [`schema/compile.md`](../schema/compile.md) holds the contract that class fills: every `Issue` reported at the `path` it is handed, and a typed surface identical to what `pvl.compile()` returns before compilation, so the import swap is a drop-in at the type level too.

## Runtime Arguments go through the constructor

A Compiled Schema with Runtime Arguments ([compilation.md](./compilation.md#runtime-arguments)) declares a constructor taking each one's value as a `readonly` field, `arg0`, `arg1`, … in the order they are written, and its checks read the field (`this.arg0`). The constructor call passes each one as written, or by the name of the `const` it is hoisted into, so it is evaluated once, where the `pvl.compile(...)` call was, in that call's scope ([ADR-0030](../../adr/0030-a-method-argument-the-compiler-cant-read-is-a-runtime-argument-evaluated-once-where-it-is-written.md)):

```ts
export const getUser = (maxLength: number) => (new (class PvlCompiledSchema0 implements PvlSchema<string, string> {
  declare readonly [PVL_SCHEMA_BRAND]: true;

  readonly arg0Message: string;

  constructor(readonly arg0: number) {
    this.arg0Message = `String must contain at most ${arg0} character(s)`;
  }
  …
      if (value.length > this.arg0) {
        issues.push({ code: "TOO_BIG", message: this.arg0Message, path: path.length > 0 ? path : undefined });
      }
  …
})(maxLength) as PvlSchema<string, string>);
```

Each parameter is typed from its emitter's `parameterTypes`. A default message naming one, from its emitter's `argumentMessages`, is built once, in the constructor, into a field of its own (`arg0Message`), which the checks read: built on every Issue, it made a failing validation about 40% slower. A field is not `private`, so one a method that compiles to no check takes (`.strict()` before `.passthrough()`), or a default message a custom one replaces, is no unused private member.

## Issues are literals, so the differential test is load-bearing

Each `Issue` ([ADR-0011](../../adr/0011-result-failure-branch-carries-pvl-issue.md)) is a plain object literal, importing nothing, with its code, message and path written out. Nothing but the differential test against the interpreted path keeps them right, which is why that test is load-bearing, not optional.
