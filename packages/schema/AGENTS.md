# `@pvl/schema`

A Zod-style schema validation library: compose `Schema`s and validate values against them at runtime. This file documents the conventions the package is built under. See [`@pvl/schema-compiler`'s `AGENTS.md`](../schema-compiler/AGENTS.md) for what the compiler does with a schema defined here, [`CONTEXT.md`](../../CONTEXT.md) for the domain glossary (`Schema`, `Modifier`, `Constraint`, `Issue`, `Result`, `Refinement`, `Transform`, `Coercion`, `Chainable Schema`, `Compiled Schema`) used throughout, and [`TESTS.md`](./TESTS.md) for the testing strategy.

## Technology

- TypeScript, ESM source (see root `AGENTS.md` Core Rules). The only runtime dependency is `@standard-schema/spec` — the canonical `StandardSchemaV1` type definitions, types-only and zero executable code.
- Built and published with tsup (see the `tsup` skill), emitting **both** ESM and CJS — [ADR-0004](../../docs/adr/0004-dual-esm-cjs-publish-via-tsup.md). The dual output is a publish-target concern only; source stays ESM.
- Takes the monorepo's shared `@repo/eslint-config` (its generic `base` preset, not the React-flavored ones) and `@repo/typescript-config` (`base.json`) as `workspace:*` devDependencies rather than standalone config, plus [`@repo/types`](../types/AGENTS.md) as a dependency for its own internal `as const` enums (e.g. `Issue` codes).

## Architecture

### Entry point: the `pvl` namespace

The single public entry point is a `pvl` namespace object (`import { pvl } from '@pvl/schema'`), not a set of flat named exports. Every factory hangs off it: `pvl.string()`, `pvl.number()`, `pvl.boolean()`, `pvl.bigint()`, `pvl.object(shape)`, `pvl.array(item)`, `pvl.union(schemas)`, `pvl.literal(value)`, `pvl.enum(source)`, `pvl.compile(schema)`.

### `Schema` and `ChainableSchema`: two abstract classes, one per file

[ADR-0020](../../docs/adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md) splits the base into two classes:

- **`Schema<Input, Output>`** (`src/schemas/schema.ts`) is everything a schema needs to validate, with no Modifier on it: the two ordered `Modifier` arrays and the constructor that seeds them, `validate()`, `"~standard"`, `_validate` with the runners that execute both arrays, the abstract `_checkType`, and every internal method a Modifier is built with (`_coerceInput`, `_clone`, `_withPreModifier`, `_withPostModifier`, `_withoutModifiers`). It is what fields, elements, union members and `pvl.compile()`'s argument are typed as, and what `.transform()` and `pvl.compile()` return. Its private and protected members mean only its own subclasses satisfy it ([ADR-0018](../../docs/adr/0018-composite-fields-are-pvl-schemas-only.md)).
- **`ChainableSchema<Input, Output>`** (`src/schemas/chainableSchema.ts`) extends `Schema` with the five Shared Modifiers and nothing else: `.optional()`, `.nullable()`, `.refine(predicate, options?)`, `.transform(fn)`, `.coerce()`. Anything that is not a Shared Modifier goes into `Schema`.

Every primitive and composite class (`StringSchema`, `NumberSchema`, `BooleanSchema`, `BigintSchema`, `ObjectSchema`, `ArraySchema`, `UnionSchema`, `LiteralSchema`, `EnumSchema`) extends `ChainableSchema`. A concrete subclass adds only its constructor, its `_checkType` (the type guard, plus every child on a composite), an optional `_coerceInput` override, and its Local Modifiers, built on the inherited `protected` helpers. It never adds a second copy of `"~standard"`, of a Shared Modifier or of the pipeline.

### Chained-instance-method API and the pipeline

Every Modifier is a method on the instance returning a schema, not a wrapping function or static combinator — `pvl.string().min(3).optional()`, not `pvl.optional(pvl.string().min(3))` ([ADR-0006](../../docs/adr/0006-chained-instance-method-api-via-shared-base-schema-class.md)). Every class keeps its own type through every Modifier, primitives included, via its type-only `'~kind'` and `RetypedSchema<this, Input, Output>`; `.transform()` is the one exception (see Transformation).

Each Modifier method builds one `Modifier` value (`src/modifiers.ts`) and appends it, on a clone, to one of two arrays through `_withPreModifier`/`_withPostModifier`:

| Modifier                                                             | Array                  | Tags                                              |
| -------------------------------------------------------------------- | ---------------------- | ------------------------------------------------- |
| `.optional()`, `.nullable()`                                         | pre                    | `SHORT_CIRCUIT`                                   |
| `.coerce()`                                                          | pre                    | none                                              |
| Constraints (`.min()`, `.max()`, `.length()`, `.int()`), `.refine()` | post                   | none                                              |
| `object`'s default strip, `.strict()`                                | post                   | none                                              |
| `.transform()`                                                       | post (always the last) | `REQUIRES_ALL_PASSED`, `RUNS_AFTER_SHORT_CIRCUIT` |

`_validate(value, path)` runs the pre-modifiers in chain order, then `_checkType`, then the post-modifiers in chain order, collecting every `Issue` ([ADR-0010](../../docs/adr/0010-modifiers-run-in-chain-order-around-the-type-check.md) holds the six exact steps). An untagged `fn` result reads as: `null` continue, `{ issues }` collect and continue, `{ value }` replace and continue. The tags are the only departures: `SHORT_CIRCUIT` accepts the value and skips everything but `RUNS_AFTER_SHORT_CIRCUIT` steps; `REQUIRES_ALL_PASSED` skips a step once anything failed. A failed `_checkType` returns at once, so no post-modifier ever sees a wrongly typed value. A `fn` gets only `(value, path)`: a schema type whose post-modifier needs more than the current value keeps it itself (`object`, below).

```ts
pvl.string().min(1).max(100).optional();
pvl.number().int().nullable();
pvl.object({ name: pvl.string() }).strict();
pvl.object({ extra: pvl.string() }).passthrough();
```

### Schema surface (v1 scope)

Primitives (`string`, `number`, `boolean`, `bigint`), `object`, `array` (including nested combinations), `optional`, `nullable`, `union`, `literal`, `enum`. Recursive/self-referential schemas and `record`/`tuple`/`intersection` are deferred past v1.

- **`number`** accepts any JS `number` (`typeof value === "number"`) — floats, integers and large values alike. It rejects `NaN` explicitly, since an accepted `NaN` would silently fail every `.min()`/`.max()` comparison instead of surfacing a clear "not a number" `Issue`. It accepts `Infinity`/`-Infinity`: there is no finiteness constraint in v1. It has no `bigint` involvement at all, bare or via `.coerce()` — arbitrary-precision integers are `pvl.bigint()`'s job.
- **`bigint`** accepts only a real JS `bigint`, never overlapping `number`'s accepted shapes. `.coerce()` additionally accepts `string` and `number` via native `BigInt(value)`; a throw from `BigInt()` (a malformed string like `"12.5"`, a non-integer number like `1.5`) is caught in `_coerceInput` and surfaces as the normal base-type `Issue` rather than propagating — no custom parsing grammar is layered on `BigInt()`'s own. `.min()`/`.max()` compare real `bigint` operators against real `bigint` bounds; cross-type comparison isn't supported. There is no `.int()` — a `bigint` has no fractional representation, so the constraint could never reject anything. Output stays a real `bigint`, never converted to `number` (reintroducing the precision loss `bigint` exists to avoid) or `string`.
- **`object`** strips unknown keys by default ([ADR-0007](../../docs/adr/0007-object-strips-unknown-keys-by-default.md)): `_checkType` keeps every key, and a strip post-modifier the constructor hands to `super()` drops the undeclared ones. `.strict()` removes the strip and appends a post-modifier reporting one `UNRECOGNIZED_KEY` per undeclared key, pathed to that key; `.passthrough()` only removes the strip, and widens `Output` with an `unknown` index signature. Never stash the raw input outside the pipeline (module-level or on the instance) to let a later modifier recover dropped keys: a modifier is shared by every clone of the schema it was chained on. There is no `.strip()`. The mode applies to the whole chain, not at its position — a `.refine()` on a `.passthrough()` schema sees the extra keys wherever it was chained — and each removes the other by shape (`_withoutModifiers`), so the last one chained wins. Every declared field is validated even after an earlier one fails, and unknown keys are reported only once every field passed, since a failed `_checkType` runs no post-modifier ([ADR-0012](../../docs/adr/0012-composite-schemas-collect-every-issue.md)). A field whose schema is `.optional()` becomes an optional key in the composed type, and an omitted one stays omitted from the output rather than becoming an explicit `undefined` property.
- **`union`** is **plain-only** in v1: `pvl.union([schemaA, schemaB, ...])` tries every member in order and succeeds on the first that accepts. `pvl.discriminatedUnion` is deferred, so there is no fast-path dispatch on a shared discriminant key yet. When no member accepts, it returns one `INVALID_UNION` issue (`"Value matches no union member"`, at the union's path) followed by every member's own rejection, in member order.
- **`literal`** matches exactly one constant value (`pvl.literal('OWNER')`, `pvl.literal(42)`, `pvl.literal(true)`, `pvl.literal(7n)`), so a right-shaped value of the wrong type (`'42'` for `pvl.literal(42)`) is rejected like a wrong value. The comparison is `Object.is`, not `===`, which matters for exactly the two values they disagree about: `pvl.literal(0)` rejects `-0` rather than accepting it and handing back `0`, and `pvl.literal(NaN)` matches `NaN` rather than being a schema that can never accept anything. Because a literal pins the schema to a single primitive type, `.coerce()` has an unambiguous target: it converts the input exactly as the matching primitive schema would, then applies the equality check.
- **`enum`** accepts two source forms, both producing the same kind of `EnumSchema` — only the factory's accepted input differs ([ADR-0009](../../docs/adr/0009-enum-accepts-const-object-or-string-literal-array.md)):
  - this repo's mandated `as const` enum object (see [`docs/specification/enums-and-constants.md`](../../docs/specification/enums-and-constants.md)): `pvl.enum(SYSTEM_ROLE)` validates against `ValueOfEnum<typeof SYSTEM_ROLE>`;
  - a plain array of string literals, `pvl.enum(['A', 'B'])`, for ad hoc string sets not worth a named object.

  `.coerce()` is inherited but has no enum-specific conversion — a source may mix string and number members, so there is no single target type.

### Cheap structural constraints only

The relevant primitives/composites get **cheap structural constraint** methods — `.min()`, `.max()`, `.length()`, `.int()`, plain numeric/length comparisons. Regex-backed helpers (`.email()`, `.url()`, `.regex()`) are **not** built into any schema type in v1; a consumer who needs one attaches their own `.refine()`. This keeps every built-in check on the fast, non-regex hot path (see Coding style) — not a claim that regex validation is useless, just that it doesn't belong in the built-in surface yet. [ADR-0008](../../docs/adr/0008-no-regex-backed-constraints-in-v1.md).

### Custom messages only on Modifiers that report an `Issue`

No factory and no schema constructor takes options; every type-check message is a fixed default ([ADR-0019](../../docs/adr/0019-factories-take-no-options.md)). A trailing `{ message }` (`IssueEditableProps`) exists only on the Modifiers that report an `Issue` of their own — the Constraints, `.refine()` and `object`'s `.strict()` — and is the only custom-message mechanism; there is no global error map in v1.

```ts
pvl.string().min(3, { message: 'must be at least 3 characters' });
pvl.number().refine((value) => value % 2 === 0, { message: 'must be even' });
pvl.object({ name: pvl.string() }).strict({ message: 'no extra keys' });
```

### Refinements, Transforms, Coercion

All three are supported in v1 (`CONTEXT.md` has the precise distinction), and each runs where it is chained:

- **Refinement**: `(data) => boolean` predicates attached via `.refine(predicate, options?)`, a post-modifier. Never change the value; a failing Refinement produces a `CUSTOM` `Issue`, never throws, and does not stop the post-modifiers after it. Skipped for a value `.optional()`/`.nullable()` short-circuited.
- **Coercion**: opt-in conversion of the raw input via `.coerce()`, a pre-modifier replacing the value **before** the type check, so a coerced value is checked like any other and a coercion never produces an `Issue` of its own. Its position against `.optional()`/`.nullable()` matters: `pvl.string().coerce().optional()` turns `undefined` into `'undefined'`, `pvl.string().optional().coerce()` keeps it. A no-op (identity `_coerceInput`) on `object`, `array`, `union` and `enum`.
- **Transform**: see Transformation below.

### Transformation

`.transform(fn)` converts an accepted value into a different `Output`. It ends the chain: it returns a plain `Schema<Input, ReturnType<fn>>` (`validate()` and `~standard` only, no `shape`/`element`), so every other Modifier is chained before it ([ADR-0016](../../docs/adr/0016-transform-and-compile-end-the-modifier-chain.md)). It is therefore always the last post-modifier, and the last thing to run: tagged `REQUIRES_ALL_PASSED`, it runs only if nothing failed, and tagged `RUNS_AFTER_SHORT_CIRCUIT`, it still runs after `.optional()`/`.nullable()` accepted the value — so `fn`'s parameter type includes `undefined`/`null` once those are chained.

### Standard Schema conformance

Every schema implements [`StandardSchemaV1`](../../docs/specification/standard-schema.md) — [ADR-0001](../../docs/adr/0001-adopt-standard-schema.md). `"~standard"` carries `version: 1`, `vendor: "@pvl/schema"` exactly, populated `types` (phantom `Input`/`Output`, so `StandardSchemaV1.InferInput`/`InferOutput` work for any schema built here), and a synchronous `validate`. A `Compiled Schema` compiled from these schemas reports the same `vendor`, being meant to be indistinguishable from the schema it came from ([ADR-0003](../../docs/adr/0003-compiled-schemas-conform-to-standard-schema.md)).

The internal validation result representation and `StandardSchemaV1.Result` are one shape — never two parallel representations kept in sync by hand. `Result`'s failure branch is the spec's own `FailureResult` intersected with this package's `Issue`, so `Issue.code` is readable by consumers while the type stays derived from the spec rather than re-declared beside it ([ADR-0011](../../docs/adr/0011-result-failure-branch-carries-pvl-issue.md)). Nested object/array/union failures populate `Issue.path` with the failing field's location; a top-level scalar failure may omit `path`.

### `validate()` — synchronous only

`.validate(value)` always returns `Result` synchronously and never throws for an invalid value — thrown errors are reserved for programmer error (e.g. malformed schema construction). There is no `.validateAsync()` and no async `Refinement`/`Transform` in v1: async validation has no coherent meaning at the schema level, so it is unsupported outright rather than half-supported behind a second method. A caller with an inherently async check (e.g. a uniqueness check against a database) awaits it themselves and calls `.validate()` on the resolved value.

`.validate()` never awaits or unwraps the value passed to it — a `Promise` is just an invalid value for whatever the schema expects, not something `.validate()` resolves on the caller's behalf.

### `pvl.compile()` and the compiler-facing surface

`compile()` marks a schema for ahead-of-time compilation, e.g. `pvl.object({ key: pvl.compile(pvl.object({ ... })) })`. It accepts **any schema** — primitive or composite, with any Modifier chained, `.transform()` included — so there is no candidate marker to keep in step with the Modifiers. At runtime, before compilation, it is an identity function — a schema file that uses it but hasn't been through the compiler still validates correctly through the interpreted path.

At the type level it returns a plain `Schema<InferInput<x>, InferOutput<x>>`; there is no `CompiledSchema` type. So `pvl.compile(x).optional()`, `pvl.compile(x).strict()` and `pvl.compile(x).shape` are compile errors. The supported spelling is `pvl.compile(x.optional())`, and a caller who wants to validate one field on its own keeps a reference to that field's schema ([ADR-0016](../../docs/adr/0016-transform-and-compile-end-the-modifier-chain.md), [ADR-0020](../../docs/adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md)). At runtime a Compiled Schema is a `Schema` subclass instance, not a `ChainableSchema` one, whose `_checkType` is the emitted code. An uncompiled schema stays fully editable.

What keeps that swap working, and must stay aligned with `@pvl/schema-compiler`:

- **Fields, elements and union members are `@pvl/schema` Schemas only**, typed as `Schema` so a transformed or compiled child fits, and called through their own `_validate` with the parent's path extended. A Standard Schema from another library is rejected at the type level ([ADR-0018](../../docs/adr/0018-composite-fields-are-pvl-schemas-only.md)).
- **`_checkType` is the one hook a Compiled Schema fills in.** Every Modifier is baked into the emitted code, so its modifier arrays stay empty and the `_validate` it inherits reduces to `_checkType`, which must report every `Issue` at the `path` it is handed.

See [`@pvl/schema-compiler`'s `AGENTS.md`](../schema-compiler/AGENTS.md) for what the compiler does with a marked schema.

## Coding style / best practices

- **Primitive validators must be written for raw speed** — no regex or other comparatively slow techniques. They are both the runtime hot path for every schema built on them and the performance baseline `@pvl/schema-compiler`'s output is trying to beat. This is also why regex-backed helpers stay out of the built-in surface.
- Follow [`docs/standards/typescript.md`](../../docs/standards/typescript.md) for all TypeScript conventions.
- **One `Modifier` type for every Modifier.** A Modifier is a method that builds a `Modifier` literal and calls `_withPreModifier` (before the type check) or `_withPostModifier` (after it). Tag it with `MODIFIER_TAG` only where its behaviour departs from the default reading of its result, and give it a `shape` (the factory that built it) only where a later Modifier must remove it through `_withoutModifiers`. The unknown-key mode is not a type parameter of `ObjectSchema`: only `.passthrough()` changes the output type, so `.strict()` returns `this` and `.passthrough()` widens `Output`.
- **This package carries runtime behaviour only.** A constraint's `code`, default `message` and `test` live here; the JavaScript source text the compiler emits for it lives in `@pvl/schema-compiler` (see its `AGENTS.md`).

### TSDoc is user-facing documentation, not contributor rationale

`/** */` TSDoc on anything reachable from the barrel (`src/index.ts`) **is** the published API reference: [`apps/docs`](../../apps/docs/AGENTS.md) generates `content/api/` from this source with TypeDoc, so whatever a TSDoc block says is what a consumer reads on the documentation site. Two rules follow.

**Every publicly reachable member carries user-facing TSDoc with an `@example`** — every `pvl.*` factory, every check method on every schema class, every modifier on `Schema`, and the exported types. Write for someone using the library, not maintaining it: what the member accepts, what it hands back, and a runnable snippet importing from `'@pvl/schema'` that shows both a passing and a failing case where that is the interesting part. **Adding a public member without an `@example` silently ships an empty entry in the reference.**

**Contributor rationale belongs in `//` line comments, or in TSDoc tagged `@internal`.** "See ADR-0010", "phantom property", "resolved once at construction because this is the hot path" — none of that is documentation for a consumer, and in a plain TSDoc block it becomes the first thing they read. Put it in `//` comments immediately above the declaration, which TypeDoc never picks up.

Protocol plumbing (`_validate`, `_checkType`, `_coerceInput`, `"~standard"`, the `_with*Modifier` helpers, the schema class constructors the `pvl.*` factories exist to hide) stays documented for maintainers but tagged `@internal`, so TypeDoc's `excludeInternal` drops it from the reference. `src/modifiers.ts` (`Modifier`, `MODIFIER_TAG`) and `src/utils.ts` are outside the barrel: TypeDoc never sees them, so their comments are for maintainers. `src/types.ts` holds the package's standalone types — the inference helpers and the type plumbing behind the Modifiers (`SchemaKind`, `RetypedSchema`, `PreModifiersResult`) — and is in the barrel, so that plumbing is tagged `@internal`. `modifiers.ts` holds only the `Modifier` type and what describes it. A Modifier lives with the schema class that builds it, either inline in the method or as a module-local, non-exported factory beside the class (`object`'s unknown-key modifiers in `objectSchema.ts`), because a schema file is in the barrel. A general helper a Modifier uses belongs in `utils.ts`.

Examples are not yet verified by the build ([issue #60](https://github.com/Ota-Prokopec/pvl/issues/60)); until then, check a changed snippet by hand.
