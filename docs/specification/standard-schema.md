# Standard Schema

[Standard Schema](https://github.com/standard-schema/standard-schema) is a vendor-neutral interface for TypeScript validation libraries (Zod, Valibot and ArkType implement it). A schema conforms by exposing a readonly `"~standard"` property, so a tool that knows only Standard Schema (a form library, an API framework, another validator's compose API) can validate a value and infer its types with no adapter. `@pvl/schema` implements it ([ADR-0001](../adr/0001-adopt-standard-schema.md)).

Read this before you touch `"~standard"`, `validate`, `Result` or `Issue` in `@pvl/schema` or `@pvl/schema-compiler`.

## The interfaces

The type definitions ship in `@standard-schema/spec`, `@pvl/schema`'s only runtime dependency: read `packages/schema/node_modules/@standard-schema/spec/dist/index.d.ts` for the exact shapes.

| Interface              | Adds                                                                                                         | `@pvl/schema`                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `StandardTypedV1`      | the base: `version`, `vendor`, and phantom `types` for `InferInput`/`InferOutput`                            | through `StandardSchemaV1`       |
| `StandardSchemaV1`     | `validate(value, options?)`, returning a `Result` (`{ value }` or `{ issues }`), sync or as a `Promise`      | every schema                     |
| `StandardJSONSchemaV1` | `jsonSchema.input`/`.output(target)`, returning a JSON Schema document or throwing for an unsupported target | once JSON Schema export is built |

## Conformance rules

- **Every schema implements `StandardSchemaV1`**: a readonly `"~standard"` with `version: 1`, `vendor` and `validate`.
- **`vendor` is `"@pvl/schema"`**, typed as that literal: the npm package name, since `vendor` identifies the schema library, not the monorepo. A **Compiled Schema** reports the same `vendor`: it represents the same schema, executed differently, and stays a drop-in replacement for it ([ADR-0003](../adr/0003-compiled-schemas-conform-to-standard-schema.md)). Being a `Schema` subclass instance, it inherits `"~standard"` like every other schema ([ADR-0020](../adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md)).
- **`types` is populated**, as a phantom property never constructed at runtime, because type inference is the main reason tools adopt Standard Schema.
- **`validate` takes `value: unknown` and returns a `Result` directly**, never a `Promise`: v1 has no async validation ([public-contract.md](./schema/public-contract.md#validate--synchronous-only) says why). It reports an invalid value as a `Result` and throws only for programmer error, such as a malformed schema construction.
- **`Issue.path` locates every nested failure** inside an object, array or union. A top-level scalar failure may omit it.
- **One representation.** The package's `Result` and `Issue` are the spec's types, narrowed where the package needs more: `Result`'s failure branch is `StandardSchemaV1.FailureResult & { issues: ReadonlyArray<Issue> }`, so `Issue.code` is readable while the type stays derived from the spec ([ADR-0011](../adr/0011-result-failure-branch-carries-pvl-issue.md)).
- **`StandardJSONSchemaV1` arrives with JSON Schema export**, implemented for real at that point; until then schemas expose only `StandardSchemaV1`.
