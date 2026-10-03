# Standard Schema

[Standard Schema](https://github.com/standard-schema/standard-schema) is a shared, vendor-neutral interface for TypeScript validation libraries (Zod, Valibot, ArkType, and others implement it). A schema conforms by exposing a readonly `"~standard"` property; any consumer that only knows about Standard Schema — not about `@pvl/schema` specifically — can validate a value and infer its types.

`packages/schema` must implement it. This is what lets `@pvl/schema` schemas be accepted directly by any tool built against Standard Schema (form libraries, API frameworks, other validators' `.pipe()`/compose APIs) without an adapter.

## The three interfaces

They build on each other: `StandardSchemaV1.Props` extends `StandardTypedV1.Props`, and `StandardJSONSchemaV1.Props` also extends `StandardTypedV1.Props` — a schema can implement one or both of `StandardSchemaV1` and `StandardJSONSchemaV1`, but both require the base `StandardTypedV1` shape (`version`, `vendor`, `types`).

### `StandardTypedV1` — base

Carries only version/vendor identification and the phantom `Input`/`Output` types used for inference. Every schema implements at least this, usually via one of the two interfaces below rather than directly.

```ts
export interface StandardTypedV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardTypedV1.Props<Input, Output>;
}

export declare namespace StandardTypedV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: Types<Input, Output> | undefined;
  }

  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
  }

  export type InferInput<Schema extends StandardTypedV1> = NonNullable<
    Schema['~standard']['types']
  >['input'];

  export type InferOutput<Schema extends StandardTypedV1> = NonNullable<
    Schema['~standard']['types']
  >['output'];
}
```

### `StandardSchemaV1` — runtime validation

Adds `validate`: takes an unknown value and returns a `Result` — a `SuccessResult` (`value`) or `FailureResult` (`issues`) — synchronously or as a `Promise`. This is the interface `packages/schema` schemas implement for runtime validation.

```ts
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> extends StandardTypedV1.Props<
    Input,
    Output
  > {
    readonly validate: (
      value: unknown,
      options?: StandardSchemaV1.Options | undefined,
    ) => Result<Output> | Promise<Result<Output>>;
  }

  export type Result<Output> = SuccessResult<Output> | FailureResult;

  export interface SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
  }

  export interface Options {
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }

  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>;
  }

  export interface Issue {
    readonly message: string;
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }

  export interface PathSegment {
    readonly key: PropertyKey;
  }

  export interface Types<Input = unknown, Output = Input> extends StandardTypedV1.Types<
    Input,
    Output
  > {}

  export type InferInput<Schema extends StandardTypedV1> = StandardTypedV1.InferInput<Schema>;

  export type InferOutput<Schema extends StandardTypedV1> = StandardTypedV1.InferOutput<Schema>;
}
```

### `StandardJSONSchemaV1` — JSON Schema export

Adds `jsonSchema`, a converter with `input`/`output` methods that each take a `target` (`"draft-2020-12"`, `"draft-07"`, `"openapi-3.0"`, or another string) and return a JSON Schema document, or throw if that target isn't supported. Optional for `@pvl/schema` — implement it only once JSON Schema export is actually built; don't add a stub that throws unconditionally just to satisfy the interface.

```ts
export interface StandardJSONSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardJSONSchemaV1.Props<Input, Output>;
}

export declare namespace StandardJSONSchemaV1 {
  export interface Props<Input = unknown, Output = Input> extends StandardTypedV1.Props<
    Input,
    Output
  > {
    readonly jsonSchema: StandardJSONSchemaV1.Converter;
  }

  export interface Converter {
    readonly input: (options: StandardJSONSchemaV1.Options) => Record<string, unknown>;
    readonly output: (options: StandardJSONSchemaV1.Options) => Record<string, unknown>;
  }

  export type Target = 'draft-2020-12' | 'draft-07' | 'openapi-3.0' | ({} & string);

  export interface Options {
    readonly target: Target;
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }

  export interface Types<Input = unknown, Output = Input> extends StandardTypedV1.Types<
    Input,
    Output
  > {}

  export type InferInput<Schema extends StandardTypedV1> = StandardTypedV1.InferInput<Schema>;

  export type InferOutput<Schema extends StandardTypedV1> = StandardTypedV1.InferOutput<Schema>;
}
```

## Conformance rules for `@pvl/schema`

- Every schema `@pvl/schema` produces must implement `StandardSchemaV1`: a readonly `"~standard"` property with `version: 1`, a fixed `vendor` string, and a `validate` function.
- **`vendor`**: `"@pvl/schema"` — the published npm package name of `@pvl/schema` (not `"pvl"`; `vendor` identifies the schema library, not this monorepo). This is also the `vendor` value a `Compiled Schema` (produced by `@pvl/schema-compiler`) reports: it still represents the same schema, just executed differently, so it keeps the same vendor rather than reporting `"@pvl/schema-compiler"` — see the Compiled Schema conformance discussion below. It is typed as that literal, not `string`. A Standard Schema from another library is never a field of a `pvl.object`/`pvl.array`: fields are `@pvl/schema` Schemas only ([ADR-0018](../adr/0018-composite-fields-are-pvl-schemas-only.md)).
- **`types`**: populate `Schema["~standard"].types` (as a phantom, never-constructed property — see the source's own guidance) so `StandardTypedV1.InferInput`/`InferOutput` work for consumers. Don't skip this to save a line; type inference is the main reason downstream tools adopt Standard Schema at all.
- **`validate`**: must accept `value: unknown` and return a `StandardSchemaV1.Result` — never throw for an invalid value. Reserve thrown errors for programmer error (e.g. malformed schema construction), not validation failures.
- **`Issue.path`**: populate it for any failure nested inside an object/array/union so consumers can point at the failing field. A top-level scalar failure may omit `path`.
- **Async validation**: not supported in v1. `@pvl/schema` has no async `Refinement`/`Transform` and no `validateAsync` — `validate` always returns `StandardSchemaV1.Result` directly, never a `Promise`. A consumer with an inherently async check (e.g. hitting a database) awaits it themselves before calling `validate` on the resolved value.
- **`StandardJSONSchemaV1`**: not required at first. Implement it on schemas once `@pvl/schema` (or `packages/schema-compiler`, if it's the one that owns schema introspection) supports emitting JSON Schema; until then, schemas expose only the `StandardSchemaV1` shape.

## Relationship to this project's own types

Standard Schema's `Result`/`Issue`/`SuccessResult`/`FailureResult` map directly onto this project's `Result` and `Issue` domain terms (see [`CONTEXT.md`](../../CONTEXT.md)) — `@pvl/schema`'s internal validation result type and the `StandardSchemaV1.Result` it returns from `"~standard".validate` should be the same shape, not two parallel representations kept in sync by hand. Where the package needs more than the spec's type carries — `Result`'s failure branch exposing `Issue.code` — it derives the narrower type from the spec's own (`StandardSchemaV1.FailureResult & { issues: ReadonlyArray<Issue> }`) rather than re-declaring it, so there is still one representation. See [ADR-0011](../adr/0011-result-failure-branch-carries-pvl-issue.md).

**Compiled Schemas conform too.** Confirmed: a `Compiled Schema` produced by `@pvl/schema-compiler` must also expose a conformant `"~standard"` — it stays a drop-in replacement for the `StandardSchemaV1` schema it was compiled from, so any Standard-Schema-consuming tool can accept either interchangeably. Recorded as [ADR-0003](../adr/0003-compiled-schemas-conform-to-standard-schema.md). A Compiled Schema is a `Schema` subclass instance whose `_checkType` is the fast, non-tree-walking `Instruction` sequence, so it inherits `"~standard"` like every other Schema — conformance costs nothing extra ([ADR-0020](../adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md)). Its `vendor` value is `"@pvl/schema"` (see above).
