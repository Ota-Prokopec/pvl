# `@pvl/schema`

A Zod-style schema validation library. Compose `Schema`s and validate values against them at runtime. This file documents the conventions this package is built under. See the root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) for how this package relates to `@pvl/schema-compiler`, and [`CONTEXT.md`](../../CONTEXT.md) for the domain glossary (`Schema`, `Issue`, `Result`, `Refinement`, `Transform`, `Coercion`, `Compiled Schema`, `Standalone Key`) referenced throughout this file. See [`TESTS.md`](./TESTS.md) for the testing strategy.

## Technology

- TypeScript, ESM source (see root `AGENTS.md` Core Rules). No runtime dependencies, aside from `@standard-schema/spec` — the canonical `StandardSchemaV1` type definitions published by the Standard Schema project itself (see below), which is types-only and contributes zero executable code.
- Built and published with tsup (see the `tsup` skill), emitting **both** ESM and CJS output — see [ADR-0004](../../docs/adr/0004-dual-esm-cjs-publish-via-tsup.md). The dual output is a publish-target concern only; source stays ESM.
- Tooling depends on the monorepo's shared `@repo/eslint-config` (its generic `base` preset, not the React-flavored ones) and `@repo/typescript-config` (`base.json`) as `workspace:*` devDependencies, rather than a standalone lint/type-check config. It also takes `@repo/types` as a `workspace:*` dependency for its own internal `as const` enums (e.g. `Issue` codes) — see [`packages/types/AGENTS.md`](../types/AGENTS.md).

## Architecture

### Entry point: the `pvl` namespace

`@pvl/schema` exposes a single public entry point: a `pvl` namespace object (`import { pvl } from '@pvl/schema'`), not a set of flat named exports. Every schema factory hangs off it: `pvl.string()`, `pvl.number()`, `pvl.boolean()`, `pvl.bigint()`, `pvl.object(shape)`, `pvl.array(item)`, `pvl.union(schemas)`, `pvl.literal(value)`, `pvl.enum(source)`, and `pvl.compile(schema)`.

### The shared base `Schema` class

Every primitive and composite class (`StringSchema`, `NumberSchema`, `BooleanSchema`, `BigintSchema`, `ObjectSchema`, `ArraySchema`, `UnionSchema`, `LiteralSchema`, `EnumSchema`) extends one abstract base `Schema` class. The base class is where Standard Schema conformance and the modifiers common to every schema type are implemented exactly once — a concrete subclass adds only the constructor logic and checks specific to its own shape, never a second copy of `"~standard"` or the modifier methods.

The base class implements:

- **Standard Schema conformance** (see below) — the `"~standard"` property and its `validate` implementation.
- **The common chained instance modifiers** — `.optional()`, `.nullable()`, `.refine(predicate, options?)`, `.transform(fn)`, `.coerce()`. These are available on every schema, primitive or composite, because they're orthogonal to what a schema's own shape checks.

A concrete subclass adds its own methods on top where applicable — `object`'s `.strict()`/`.passthrough()`, and the cheap structural constraints (`.min()`/`.max()`/`.length()`/`.int()`) documented below.

### Chained-instance-method API

Every modifier is a method on the schema instance that returns a (possibly differently-typed) schema, not a wrapping function or a static combinator — e.g. `pvl.string().min(3).optional()`, not `pvl.optional(pvl.string().min(3))`. This matches the Zod-style ergonomics `@pvl/schema` is modeled on and lets modifiers compose left-to-right in the order they're applied. See [ADR-0006](../../docs/adr/0006-chained-instance-method-api-via-shared-base-schema-class.md) for why this shape, backed by a shared base `Schema` class, was chosen over standalone modifier functions.

```ts
pvl.string().min(1).max(100).optional();
pvl.number().int().nullable();
pvl.object({ name: pvl.string() }).strict();
pvl.object({ extra: pvl.string() }).passthrough();
```

### Schema surface (v1 scope)

Primitives (`string`, `number`, `boolean`, `bigint`), `object`, `array` (including nested combinations of these), `optional`, `nullable`, `union`, `literal`, `enum`. Recursive/self-referential schemas and `record`/`tuple`/`intersection` are deferred past v1.

- **`number`** validates any JS `number` value (`typeof value === "number"`) — floats, integers, and large values alike, since JS has only one numeric type. It rejects `NaN` explicitly (despite `typeof NaN === "number"`): an accepted `NaN` would silently fail every `.min()`/`.max()` comparison instead of surfacing a clear "not a number" `Issue`. It accepts `Infinity`/`-Infinity` — there's no built-in finiteness constraint in v1. It has no `bigint` involvement at all, bare or via `.coerce()` — arbitrary-precision integers are `pvl.bigint()`'s job, not this schema's (see below).
- **`bigint`** validates only a real JS `bigint` (`typeof value === "bigint"`), never overlapping with `number`'s accepted shapes. `.coerce()` additionally accepts `string` and `number`, converting via native `BigInt(value)`; a throw from `BigInt()` (a malformed string like `"12.5"`, or a non-integer number like `1.5`) is caught in `_coerceInput` and surfaces as the normal base-type `Issue` rather than propagating — no custom parsing grammar is layered on top of `BigInt()`'s own string parsing. `.min()`/`.max()` compare using real `bigint` operators against real `bigint` bounds; cross-type (`bigint`/`number`) comparison isn't supported. There's no `.int()` — a `bigint` has no fractional representation, so the constraint would never reject anything. Output stays a real `bigint`, never converted to `number` (which would reintroduce the precision loss `bigint` exists to avoid) or `string`.
- **`object`** strips unknown keys by default. `.strict()` reports unexpected keys as validation `Issue`s instead of silently dropping them. `.passthrough()` preserves unrecognized keys, untyped, instead of stripping or rejecting them. Exactly one of the three behaviors (default strip / strict / passthrough) is active per `ObjectSchema` instance — the last of `.strict()`/`.passthrough()` applied wins. See [ADR-0007](../../docs/adr/0007-object-strips-unknown-keys-by-default.md) for why strip is the default. Every declared field is validated even after an earlier one fails, so one `Result` reports an `Issue` per failing field (and, under `.strict()`, one per unrecognized key, each pathed to that key) rather than only the first — see [ADR-0012](../../docs/adr/0012-composite-schemas-collect-every-issue.md). A field whose schema is `.optional()` becomes an optional key in the composed type, and an omitted one stays omitted from the output rather than becoming an explicit `undefined` property.
- **`union`** is **plain-only** in v1: `pvl.union([schemaA, schemaB, ...])` tries each member schema and succeeds if any accepts the value. Discriminated union (`pvl.discriminatedUnion`) is deferred past v1 — there is no fast-path dispatch on a shared discriminant key yet, so every member schema is attempted.
- **`literal`** matches exactly one constant value (`pvl.literal('OWNER')`, `pvl.literal(42)`, `pvl.literal(true)`, `pvl.literal(7n)`), so a right-shaped value of the wrong type (`'42'` for `pvl.literal(42)`) is rejected just like a wrong value is. The comparison is `Object.is`, not `===`, which matters for exactly the two values they disagree about: `pvl.literal(0)` rejects `-0` rather than accepting it and handing back `0`, and `pvl.literal(NaN)` matches `NaN` rather than being a schema that can never accept anything. Because a literal pins the schema to a single primitive type, `.coerce()` has an unambiguous target: it converts the input exactly as the matching primitive schema would, then applies the equality check.
- **`enum`** accepts two source forms:
  - This repo's mandated `as const` enum-object shape (see [`docs/specification/enums-and-constants.md`](../../docs/specification/enums-and-constants.md)): `pvl.enum(SYSTEM_ROLE)` where `SYSTEM_ROLE = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const` — the schema validates against `ValueOfEnum<typeof SYSTEM_ROLE>`.
  - A plain array of string literals: `pvl.enum(['A', 'B'])` — for ad hoc string sets that don't warrant first declaring a named `as const` object.

  Both forms produce the same kind of `EnumSchema`; only the accepted input shape to the `pvl.enum()` factory differs. See [ADR-0009](../../docs/adr/0009-enum-accepts-const-object-or-string-literal-array.md). `.coerce()` is inherited but has no enum-specific conversion — a source may mix string and number members, so there's no single target type to convert an input to.

### Cheap structural constraints only

The relevant primitives/composites get **cheap structural constraint** methods: `.min()`, `.max()`, `.length()`, `.int()` (plain numeric/length comparisons only). Regex-backed constraint helpers (`.email()`, `.url()`, `.regex()`) are **not** built into any schema type in v1 — a consumer who needs one attaches it as their own `.refine()`. This keeps every built-in primitive/composite check on the fast, non-regex hot path (see Coding style below); it isn't a statement that regex validation is never useful, just that it doesn't belong in the library's own built-ins yet. See [ADR-0008](../../docs/adr/0008-no-regex-backed-constraints-in-v1.md).

### Trailing-options-object custom messages

Every schema-affecting call — factories and constraint methods alike — accepts an optional trailing options object whose `message` field overrides the default `Issue` message it would otherwise produce:

```ts
pvl.string({ message: 'must be a string' });
pvl.string().min(3, { message: 'must be at least 3 characters' });
pvl.object({ name: pvl.string() }, { message: 'invalid payload' });
```

This is the _only_ place a custom message is supplied — there's no separate global error-map mechanism in v1.

### Refinements, Transforms, Coercion

All three are supported in v1 (see `CONTEXT.md` for the precise distinction between them):

- **Refinement**: `(data) => boolean` predicates attached to a schema via `.refine(predicate, options?)`, e.g. `myCustomValidationFunction`. Never change the value; a failing Refinement produces a Result `Issue`, it never throws.
- **Transform**: functions attached via `.transform(fn)` that convert a schema's accepted value into a different `Output` value (`Input !== Output`), run as part of producing the `Result`. The schema's inferred `Output` type reflects the transform's return type, distinct from its `Input` type.
- **Coercion**: opt-in conversion of the raw input value to the schema's target type via `.coerce()`, run strictly _before_ the schema's own checks — a coercion failure and a base-check failure compose predictably because coercion always resolves first.

### Standard Schema conformance

Every schema this package produces implements [`StandardSchemaV1`](../../docs/specification/standard-schema.md) — see [ADR-0001](../../docs/adr/0001-adopt-standard-schema.md). `"~standard"` carries `version: 1`, `vendor: "@pvl/schema"` exactly, populated `types` (phantom `Input`/`Output`, so `StandardSchemaV1.InferInput`/`InferOutput` work for any schema built with this library), and a synchronous `validate`. This is also the `vendor` value reported by `Compiled Schema`s produced by `@pvl/schema-compiler` from this package's schemas — a `Compiled Schema` is meant to be indistinguishable from the schema it was compiled from (see [ADR-0003](../../docs/adr/0003-compiled-schemas-conform-to-standard-schema.md)).

Internal validation result representation and `StandardSchemaV1.Result` must be the same shape — don't maintain two parallel representations kept in sync by hand. `Result`'s failure branch is the spec's own `FailureResult` intersected with this package's `Issue`, so `Issue.code` is readable by consumers while the type stays derived from the spec rather than re-declared beside it — see [ADR-0011](../../docs/adr/0011-result-failure-branch-carries-pvl-issue.md). Nested object/array/union validation failures populate `Issue.path` with the failing field's location; a top-level scalar failure may omit `path`.

### `validate()` — synchronous only, no async support in v1

`.validate(value)` always returns `Result` synchronously and never throws for an invalid value — thrown errors are reserved for programmer error (e.g. malformed schema construction), never for a value failing validation. There is no `.validateAsync()` and no async `Refinement`/`Transform` in v1: async validation doesn't have a coherent meaning at the schema level (what would "validating" a not-yet-resolved value even do?), so it isn't supported at all, rather than being half-supported behind a second method. A caller with an inherently async check (e.g. a uniqueness check against a database) awaits it themselves and calls `.validate()` on the resolved value.

`.validate()` never awaits or unwraps a value passed to it as the thing being checked — a `Promise` passed as the input value is just an invalid value for whatever the schema expects (same as passing any other wrong-shaped value), not something `.validate()` resolves on the caller's behalf.

### `pvl.compile()` and the compiler-facing surface

This package exports `compile()`, used to mark a schema as a candidate for ahead-of-time compilation, e.g. `pvl.object({ key: pvl.compile(pvl.object({ ... })) })`. It only accepts a **composite schema** (`object` or `array`) — wrapping a bare primitive like `pvl.compile(pvl.string())` is forbidden (compiling a single primitive has no tree to flatten, so there's nothing to gain; `@pvl/schema` rejects this at the type level — passing a primitive to `compile()` shouldn't type-check — and `@pvl/schema-compiler` also flags it defensively if it somehow gets past that). At runtime, before compilation, `compile()` behaves as an identity function — it returns its argument schema unchanged, so a schema file that uses it but hasn't been through the compiler still validates correctly via the normal interpreted path.

At the type level it does **not** return its argument's type: it narrows to a terminal `Compiled Schema` type whose surface is `"~standard"`, `validate()`, `shape` and `element`, with no modifier and no structural edit attachable. `pvl.compile(x).optional()` and `pvl.compile(x).strict()` are compile errors; the supported spelling is `pvl.compile(x.optional())`, so every modifier is applied before compiling and there is exactly one correct place to put one. See [ADR-0016](../../docs/adr/0016-compiled-schemas-are-terminal.md). An uncompiled schema stays fully editable, primitive or composite alike — the restriction applies only where it's earned.

Three pieces of this package's own surface exist to make that swap work, and must stay aligned with `@pvl/schema-compiler`:

- **`shape` on `ObjectSchema` and `element` on `ArraySchema`**, so the interpreted schema and the `Compiled Schema` present the same reachable structure. A `.standalone()` marker on a key is what puts it in a `Compiled Schema`'s `shape` (a `Standalone Key`); it is a **no-op on an uncompiled schema**, so adding or removing `pvl.compile(...)` never breaks a source file that uses it.
- **Class-preserving modifiers.** `.refine()` returns `this` on every schema — a Refinement changes neither `Input` nor `Output`, so there is nothing to widen. `.optional()`, `.nullable()` and `.transform()` do change them, so `ObjectSchema`/`ArraySchema` carry `Input` and `Output` as trailing type parameters (defaulted to the types they derive from their shape/item) and override those three to return themselves with the parameters widened — a refined, optional, nullable or transformed composite is still an `ObjectSchema`/`ArraySchema` and remains a valid argument to `compile()`. On a primitive those three still widen to `Schema<Input, Output>`: a primitive is never a `compile()` candidate, and the base return type is what keeps `.min()`-style constraints off a schema whose accepted types have moved on. See [ADR-0006](../../docs/adr/0006-chained-instance-method-api-via-shared-base-schema-class.md)'s amendment, which also records why the constraint methods had to start cloning instead of rebuilding.
- **Any `StandardSchemaV1` is accepted as a field or element** of `ObjectSchema`/`ArraySchema`, validated through its `~standard.validate` with the child's `Issue` paths re-prefixed by the parent key. This is what lets a nested `Compiled Schema` — a plain Standard Schema object, not a subclass of this package's `Schema` — sit inside an interpreted parent and still satisfy [ADR-0012](../../docs/adr/0012-composite-schemas-collect-every-issue.md); it also makes a schema from any other conforming library usable as a field. See [ADR-0018](../../docs/adr/0018-composites-accept-any-standard-schema-field.md).

See [`@pvl/schema-compiler`'s `AGENTS.md`](../schema-compiler/AGENTS.md) for what the compiler does with a marked schema.

## Coding style / best practices

- **Primitive validators must be written for raw speed** — no regex or other comparatively slow techniques. They're both the runtime hot path for every schema built on top of them and the performance baseline `@pvl/schema-compiler`'s compiled output is trying to beat. This is also why regex-backed constraint helpers stay out of the built-in surface (see Cheap structural constraints only, above).
- Follow [`docs/standards/typescript.md`](../../docs/standards/typescript.md) for all TypeScript conventions.

### TSDoc is user-facing documentation, not contributor rationale

`/** */` TSDoc on anything reachable from this package's barrel (`src/index.ts`) **is** the published API reference: [`apps/docs`](../../apps/docs/AGENTS.md) generates `content/api/` from this source with TypeDoc, so whatever a TSDoc block says is what a consumer reads on the documentation site. Two rules follow.

**Every publicly reachable member carries user-facing TSDoc with an `@example`.** Write for someone using the library, not for someone maintaining it: what the member accepts, what it hands back, and a runnable snippet that imports from `'@pvl/schema'` and shows both a passing and a failing case where that is the interesting part. This covers every `pvl.*` factory, every check method on every schema class, every modifier on `Schema`, and the exported types.

**Contributor rationale belongs in `//` line comments, or in TSDoc tagged `@internal`.** "See ADR-0010", "phantom property", "resolved once at construction because this is the hot path" — none of that is documentation for a consumer, and left in a plain TSDoc block it becomes the first thing they read. Put it in `//` comments immediately above the declaration, which TypeDoc never picks up.

Protocol plumbing (`_validate`, `_checkType`, `_coerceInput`, `"~standard"`, the schema class constructors that the `pvl.*` factories exist to hide) stays documented — a maintainer still needs it — but tagged `@internal`, so TypeDoc's `excludeInternal` drops it from the reference. **Adding a new public member without an `@example` silently ships an empty entry in the reference.**

An internal-only module deliberately excluded from the barrel (`schemas/sharedModifiers.ts`) is outside all of this: TypeDoc never sees it, so its TSDoc is for maintainers.

Examples are not yet verified by the build. Making them typecheck is [issue #60](https://github.com/Ota-Prokopec/pvl/issues/60); until then, check a changed snippet by hand.
