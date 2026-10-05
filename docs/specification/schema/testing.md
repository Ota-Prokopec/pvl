# Testing `@pvl/schema`

The testing strategy for `@pvl/schema`, on top of the repo-wide rules in [`TESTS.md`](../../../TESTS.md). Read this before you write, change or review a test in `packages/schema/tests/`. Apply it as-is to every schema type, so the suite stays uniform.

Tests reach a schema through its public interface only: feed it an input and assert on what `.validate()` or the type system reports. Internal state (private fields, the modifier arrays) stays out of every assertion.

## Runner and layout

Vitest, with [`fast-check`](https://fast-check.dev) for property-based tests. Tests live in `packages/schema/tests/` as `*.test.ts`, one file per schema type or concern, and `src/` holds only source. Shared assertions live in `tests/helpers.ts` (`assertSuccess`, `issueCodes`).

## The four seams

Every schema type ships with seam 1 coverage, and every composite (`object`, `array`, `union`) with seam 4 coverage too.

1. **`schema.validate(input)` → `Result`**, the uniform seam. For every Constraint and Modifier, cover a passing value, a failing value, and for numeric and length Constraints the exact boundary (exactly `min`, exactly `max`). An invalid value yields a `Result`, by contract ([public-contract.md](./public-contract.md)), so assert on the `Result`. Example: `tests/string.test.ts`.
2. **Type-level inference.** `expectTypeOf` assertions that `StandardSchemaV1.InferInput`/`InferOutput` (from `@standard-schema/spec`) give the expected static type. At minimum: a primitive, an `object`, and a `.transform()`ed schema whose `Input` differs from its `Output`. Example: `tests/standard-schema-types.test.ts`.
3. **`pvl.compile()` identity.** Before compilation, `pvl.compile(schema)` returns `schema` itself (`toBe`). It gets its own test, so the guarantee can't regress unnoticed behind a `.validate()` call ([compile.md](./compile.md)). Example: `tests/compile.test.ts`.
4. **`Issue` shape on nested failures.** Exact `Issue.code`, `message` and `path` for a failure inside an `object`, `array` or `union`, since consumers point users at the failing field by `path`. Example: `tests/object.test.ts`.

## Required cases: the Modifier pipeline

`tests/pipeline.test.ts` pins down [ADR-0010](../../adr/0010-modifiers-run-in-chain-order-around-the-type-check.md)'s steps through seam 1. Each row below is a required case; a change to `_validate` keeps every one passing, and a new tag or Modifier adds its own row.

| Schema / input                                                                                        | Result                                                                     |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pvl.string().min(5).length(3)` on `'ab'`                                                             | `TOO_SMALL`, `INVALID_LENGTH` (post-modifiers collect)                     |
| `pvl.string().min(5)` on `42`                                                                         | `INVALID_TYPE` only (no post-modifier after a failed type check)           |
| `pvl.array(pvl.string()).max(2)` on `['a', 2, 3]`                                                     | `[1] INVALID_TYPE`, `[2] INVALID_TYPE` (children failed, `.max()` skipped) |
| `pvl.object({ a: pvl.string() }).strict()` on `{ a: 1, b: 2 }`                                        | `['a'] INVALID_TYPE` only                                                  |
| `pvl.object({ a: pvl.string() }).strict()` on `{ a: 'x', b: 2 }`                                      | `['b'] UNRECOGNIZED_KEY`                                                   |
| `pvl.number().refine(isEven, { message: 'must be even' }).int()` on `2.5`                             | `CUSTOM 'must be even'`, `NOT_INTEGER`, in chain order                     |
| `pvl.string().coerce().optional()` on `undefined`                                                     | `{ value: 'undefined' }` (coerce runs first)                               |
| `pvl.string().optional().coerce()` on `undefined`                                                     | `{ value: undefined }` (optional short-circuits first)                     |
| `pvl.string().nullable().transform(f)` on `null`                                                      | `f(null)` is called, and its return value is the output                    |
| `pvl.string().nullable().refine(p)` on `null`                                                         | `{ value: null }`, `p` is not called                                       |
| `pvl.object({ id: pvl.string() }).passthrough().refine((v) => 'meta' in v)` on `{ id: 'a', meta: 1 }` | passes: `.refine()` sees `meta`                                            |
| the same with `.refine(...)` chained before `.passthrough()`                                          | passes: the mode applies to the whole chain                                |
| `pvl.object({ id: pvl.string() }).refine((v) => 'meta' in v)` on `{ id: 'a', meta: 1 }`               | `CUSTOM`: `.refine()` ran on the stripped value                            |
| `pvl.string().min(5).transform(f)` on `'ab'`                                                          | `TOO_SMALL`, `f` is not called                                             |

Where an assertion lists several issues' codes, read them with `issueCodes(result)` from `tests/helpers.ts`: `result.issues?.map(...)` resolves to the spec's `Issue`, which has no `code`.

## Property-based tests

Use `fast-check` on primitives and composites where generated inputs find what hand-picked examples miss: off-by-one Constraint boundaries, unusual-but-valid strings and numbers, deeply nested `object`/`array` shapes. Example: the property-based block in `tests/string.test.ts`.

## Scope

This suite covers the interpreted path. Compiled output is `@pvl/schema-compiler`'s to test, by diffing it against this path ([code-generation.md](../schema-compiler/code-generation.md#issues-are-literals-so-the-differential-test-is-load-bearing)), so this package's compile coverage ends at seam 3.
