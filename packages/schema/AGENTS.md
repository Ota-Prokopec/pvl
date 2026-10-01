# `@pvl/schema`

A Zod-style schema validation library: compose `Schema`s and validate values against them at runtime. This file documents the conventions the package is built under. See [`@pvl/schema-compiler`'s `AGENTS.md`](../schema-compiler/AGENTS.md) for what the compiler does with a schema defined here, [`CONTEXT.md`](../../CONTEXT.md) for the domain glossary (`Schema`, `Issue`, `Result`, `Refinement`, `Transform`, `Coercion`, `Compiled Schema`, `Standalone Key`) used throughout, and [`TESTS.md`](./TESTS.md) for the testing strategy.

## Technology

- TypeScript, ESM source (see root `AGENTS.md` Core Rules). The only runtime dependency is `@standard-schema/spec` — the canonical `StandardSchemaV1` type definitions, types-only and zero executable code.
- Built and published with tsup (see the `tsup` skill), emitting **both** ESM and CJS — [ADR-0004](../../docs/adr/0004-dual-esm-cjs-publish-via-tsup.md). The dual output is a publish-target concern only; source stays ESM.
- Takes the monorepo's shared `@repo/eslint-config` (its generic `base` preset, not the React-flavored ones) and `@repo/typescript-config` (`base.json`) as `workspace:*` devDependencies rather than standalone config, plus [`@repo/types`](../types/AGENTS.md) as a dependency for its own internal `as const` enums (e.g. `Issue` codes).

## Architecture

### Entry point: the `pvl` namespace

The single public entry point is a `pvl` namespace object (`import { pvl } from '@pvl/schema'`), not a set of flat named exports. Every factory hangs off it: `pvl.string()`, `pvl.number()`, `pvl.boolean()`, `pvl.bigint()`, `pvl.object(shape)`, `pvl.array(item)`, `pvl.union(schemas)`, `pvl.literal(value)`, `pvl.enum(source)`, `pvl.compile(schema)`.

### The shared base `Schema` class

Every primitive and composite class (`StringSchema`, `NumberSchema`, `BooleanSchema`, `BigintSchema`, `ObjectSchema`, `ArraySchema`, `UnionSchema`, `LiteralSchema`, `EnumSchema`) extends one abstract base `Schema`, which implements exactly once:

- **Standard Schema conformance** — the `"~standard"` property and its `validate`.
- **The common chained modifiers** — `.optional()`, `.nullable()`, `.refine(predicate, options?)`, `.transform(fn)`, `.coerce()`. Every schema has them, primitive or composite, because they're orthogonal to what a schema's own shape checks.

A concrete subclass adds only its own constructor logic, checks and extra methods — `object`'s `.strict()`/`.passthrough()`, the cheap structural constraints below — never a second copy of `"~standard"` or of a base modifier.

### Chained-instance-method API

Every modifier is a method on the instance returning a (possibly differently-typed) schema, not a wrapping function or static combinator — `pvl.string().min(3).optional()`, not `pvl.optional(pvl.string().min(3))` — so modifiers compose left-to-right in the order applied. [ADR-0006](../../docs/adr/0006-chained-instance-method-api-via-shared-base-schema-class.md) records why this shape over standalone modifier functions.

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
- **`object`** strips unknown keys by default ([ADR-0007](../../docs/adr/0007-object-strips-unknown-keys-by-default.md)). `.strict()` reports unexpected keys as `Issue`s instead of dropping them; `.passthrough()` preserves them untyped. Exactly one of the three behaviors is active per instance — the last of `.strict()`/`.passthrough()` applied wins. Every declared field is validated even after an earlier one fails, so one `Result` carries an `Issue` per failing field (and under `.strict()` one per unrecognized key, each pathed to that key) rather than only the first — [ADR-0012](../../docs/adr/0012-composite-schemas-collect-every-issue.md). A field whose schema is `.optional()` becomes an optional key in the composed type, and an omitted one stays omitted from the output rather than becoming an explicit `undefined` property.
- **`union`** is **plain-only** in v1: `pvl.union([schemaA, schemaB, ...])` tries every member and succeeds if any accepts. `pvl.discriminatedUnion` is deferred, so there is no fast-path dispatch on a shared discriminant key yet.
- **`literal`** matches exactly one constant value (`pvl.literal('OWNER')`, `pvl.literal(42)`, `pvl.literal(true)`, `pvl.literal(7n)`), so a right-shaped value of the wrong type (`'42'` for `pvl.literal(42)`) is rejected like a wrong value. The comparison is `Object.is`, not `===`, which matters for exactly the two values they disagree about: `pvl.literal(0)` rejects `-0` rather than accepting it and handing back `0`, and `pvl.literal(NaN)` matches `NaN` rather than being a schema that can never accept anything. Because a literal pins the schema to a single primitive type, `.coerce()` has an unambiguous target: it converts the input exactly as the matching primitive schema would, then applies the equality check.
- **`enum`** accepts two source forms, both producing the same kind of `EnumSchema` — only the factory's accepted input differs ([ADR-0009](../../docs/adr/0009-enum-accepts-const-object-or-string-literal-array.md)):
  - this repo's mandated `as const` enum object (see [`docs/specification/enums-and-constants.md`](../../docs/specification/enums-and-constants.md)): `pvl.enum(SYSTEM_ROLE)` validates against `ValueOfEnum<typeof SYSTEM_ROLE>`;
  - a plain array of string literals, `pvl.enum(['A', 'B'])`, for ad hoc string sets not worth a named object.

  `.coerce()` is inherited but has no enum-specific conversion — a source may mix string and number members, so there is no single target type.

### Cheap structural constraints only

The relevant primitives/composites get **cheap structural constraint** methods — `.min()`, `.max()`, `.length()`, `.int()`, plain numeric/length comparisons. Regex-backed helpers (`.email()`, `.url()`, `.regex()`) are **not** built into any schema type in v1; a consumer who needs one attaches their own `.refine()`. This keeps every built-in check on the fast, non-regex hot path (see Coding style) — not a claim that regex validation is useless, just that it doesn't belong in the built-in surface yet. [ADR-0008](../../docs/adr/0008-no-regex-backed-constraints-in-v1.md).

### Trailing-options-object custom messages

Every schema-affecting call — factories and constraint methods alike — takes an optional trailing options object whose `message` overrides the default `Issue` message. This is the _only_ mechanism for a custom message; there is no global error map in v1.

```ts
pvl.string({ message: 'must be a string' });
pvl.string().min(3, { message: 'must be at least 3 characters' });
pvl.object({ name: pvl.string() }, { message: 'invalid payload' });
```

### Refinements, Transforms, Coercion

All three are supported in v1 (`CONTEXT.md` has the precise distinction):

- **Refinement**: `(data) => boolean` predicates attached via `.refine(predicate, options?)`. Never change the value; a failing Refinement produces a `Result` `Issue` and never throws.
- **Transform**: functions attached via `.transform(fn)` converting an accepted value into a different `Output` (`Input !== Output`), run as part of producing the `Result`. The schema's inferred `Output` reflects the transform's return type, distinct from its `Input`.
- **Coercion**: opt-in conversion of the raw input to the schema's target type via `.coerce()`, run strictly _before_ the schema's own checks, so a coercion failure and a base-check failure compose predictably.

### Standard Schema conformance

Every schema implements [`StandardSchemaV1`](../../docs/specification/standard-schema.md) — [ADR-0001](../../docs/adr/0001-adopt-standard-schema.md). `"~standard"` carries `version: 1`, `vendor: "@pvl/schema"` exactly, populated `types` (phantom `Input`/`Output`, so `StandardSchemaV1.InferInput`/`InferOutput` work for any schema built here), and a synchronous `validate`. A `Compiled Schema` compiled from these schemas reports the same `vendor`, being meant to be indistinguishable from the schema it came from ([ADR-0003](../../docs/adr/0003-compiled-schemas-conform-to-standard-schema.md)).

The internal validation result representation and `StandardSchemaV1.Result` are one shape — never two parallel representations kept in sync by hand. `Result`'s failure branch is the spec's own `FailureResult` intersected with this package's `Issue`, so `Issue.code` is readable by consumers while the type stays derived from the spec rather than re-declared beside it ([ADR-0011](../../docs/adr/0011-result-failure-branch-carries-pvl-issue.md)). Nested object/array/union failures populate `Issue.path` with the failing field's location; a top-level scalar failure may omit `path`.

### `validate()` — synchronous only

`.validate(value)` always returns `Result` synchronously and never throws for an invalid value — thrown errors are reserved for programmer error (e.g. malformed schema construction). There is no `.validateAsync()` and no async `Refinement`/`Transform` in v1: async validation has no coherent meaning at the schema level, so it is unsupported outright rather than half-supported behind a second method. A caller with an inherently async check (e.g. a uniqueness check against a database) awaits it themselves and calls `.validate()` on the resolved value.

`.validate()` never awaits or unwraps the value passed to it — a `Promise` is just an invalid value for whatever the schema expects, not something `.validate()` resolves on the caller's behalf.

### `pvl.compile()` and the compiler-facing surface

`compile()` marks a schema as a candidate for ahead-of-time compilation, e.g. `pvl.object({ key: pvl.compile(pvl.object({ ... })) })`. It accepts only a **composite schema** (`object` or `array`): compiling a bare primitive has no tree to flatten, so `pvl.compile(pvl.string())` is rejected at the type level here and flagged defensively by `@pvl/schema-compiler` too. At runtime, before compilation, it is an identity function — a schema file that uses it but hasn't been through the compiler still validates correctly through the interpreted path.

At the type level it does **not** return its argument's type: it narrows to a terminal `Compiled Schema` whose surface is `"~standard"`, `validate()`, `shape` and `element`, with no modifier or structural edit attachable. `pvl.compile(x).optional()` and `pvl.compile(x).strict()` are compile errors; the supported spelling is `pvl.compile(x.optional())`, so every modifier is applied before compiling and there is exactly one correct place to put one ([ADR-0016](../../docs/adr/0016-compiled-schemas-are-terminal.md)). An uncompiled schema stays fully editable, primitive or composite alike — the restriction applies only where it's earned.

Three pieces of this package's surface exist to make that swap work, and must stay aligned with `@pvl/schema-compiler`:

- **`shape` on `ObjectSchema` and `element` on `ArraySchema`**, so the interpreted schema and the `Compiled Schema` present the same reachable structure. A `.standalone()` marker on a key is what puts it in a `Compiled Schema`'s `shape` (a `Standalone Key`); it is a **no-op on an uncompiled schema**, so adding or removing `pvl.compile(...)` never breaks a source file that uses it.
- **Class-preserving modifiers.** `.refine()` returns `this` on every schema — a Refinement changes neither `Input` nor `Output`, so there is nothing to widen. `.optional()`, `.nullable()` and `.transform()` do change them, so `ObjectSchema`/`ArraySchema` carry `Input` and `Output` as trailing type parameters (defaulted to what they derive from their shape/item) and override those three to return themselves with the parameters widened — a refined, optional, nullable or transformed composite is still an `ObjectSchema`/`ArraySchema` and still a valid argument to `compile()`. On a primitive those three still widen to `Schema<Input, Output>`: a primitive is never a `compile()` candidate, and the base return type is what keeps `.min()`-style constraints off a schema whose accepted types have moved on. See [ADR-0006](../../docs/adr/0006-chained-instance-method-api-via-shared-base-schema-class.md)'s amendment, which also records why the constraint methods had to start cloning instead of rebuilding.
- **Any `StandardSchemaV1` is accepted as a field or element** of `ObjectSchema`/`ArraySchema`, validated through its `~standard.validate` with the child's `Issue` paths re-prefixed by the parent key. This is what lets a nested `Compiled Schema` — a plain Standard Schema object, not a subclass of this package's `Schema` — sit inside an interpreted parent and still satisfy [ADR-0012](../../docs/adr/0012-composite-schemas-collect-every-issue.md); it also makes a schema from any other conforming library usable as a field ([ADR-0018](../../docs/adr/0018-composites-accept-any-standard-schema-field.md)).

See [`@pvl/schema-compiler`'s `AGENTS.md`](../schema-compiler/AGENTS.md) for what the compiler does with a marked schema.

## Coding style / best practices

- **Primitive validators must be written for raw speed** — no regex or other comparatively slow techniques. They are both the runtime hot path for every schema built on them and the performance baseline `@pvl/schema-compiler`'s output is trying to beat. This is also why regex-backed helpers stay out of the built-in surface.
- Follow [`docs/standards/typescript.md`](../../docs/standards/typescript.md) for all TypeScript conventions.

### TSDoc is user-facing documentation, not contributor rationale

`/** */` TSDoc on anything reachable from the barrel (`src/index.ts`) **is** the published API reference: [`apps/docs`](../../apps/docs/AGENTS.md) generates `content/api/` from this source with TypeDoc, so whatever a TSDoc block says is what a consumer reads on the documentation site. Two rules follow.

**Every publicly reachable member carries user-facing TSDoc with an `@example`** — every `pvl.*` factory, every check method on every schema class, every modifier on `Schema`, and the exported types. Write for someone using the library, not maintaining it: what the member accepts, what it hands back, and a runnable snippet importing from `'@pvl/schema'` that shows both a passing and a failing case where that is the interesting part. **Adding a public member without an `@example` silently ships an empty entry in the reference.**

**Contributor rationale belongs in `//` line comments, or in TSDoc tagged `@internal`.** "See ADR-0010", "phantom property", "resolved once at construction because this is the hot path" — none of that is documentation for a consumer, and in a plain TSDoc block it becomes the first thing they read. Put it in `//` comments immediately above the declaration, which TypeDoc never picks up.

Protocol plumbing (`_validate`, `_checkType`, `_coerceInput`, `"~standard"`, the schema class constructors the `pvl.*` factories exist to hide) stays documented for maintainers but tagged `@internal`, so TypeDoc's `excludeInternal` drops it from the reference. An internal-only module deliberately excluded from the barrel (`schemas/sharedModifiers.ts`) is outside all of this: TypeDoc never sees it, so its TSDoc is for maintainers.

Examples are not yet verified by the build ([issue #60](https://github.com/Ota-Prokopec/pvl/issues/60)); until then, check a changed snippet by hand.
