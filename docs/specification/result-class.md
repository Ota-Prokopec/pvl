# Result as a class

Spec issue: [#105](https://github.com/Ota-Prokopec/pvl/issues/105)

## Problem Statement

In `@pvl/schema`, a **Result** is only a type: `Result<Output>` is a union of the Standard Schema `SuccessResult` and this library's `FailureResult`. Every Result is a hand-written `{ value }` or `{ issues }` object literal. There are about twenty of these, spread over the Schemas, the pipeline runners, `.refine()` and `unionSchema`, and generated code in the Destination File will write more. Nothing marks a value as a pvl Result at runtime, nothing builds Results in one place, and the type checker accepts any plain object shaped like a Result.

`Issue` already went the other way. It is a class that `implements StandardSchemaV1.Issue`, with an `@internal` constructor that both interpreted Schemas and generated code call. That convention was never recorded in an ADR, and `Result` doesn't follow it.

## Solution

`Result` becomes a class with two subclasses, one for each branch. Every Result is built through two `@internal` static factories, `Result.success(value)` and `Result.failure(issues)`. The name `Result<Output>` stays the union type that `.validate()` returns, so callers keep writing `const r: Result<string> = schema.validate(x)`, and `if (r.issues)` narrows exactly as it does today. Each branch class `implements` its Standard Schema interface and copies the spec's fields exactly, so conformance is checked at compile time and a Result's runtime shape is unchanged: a success is still `{ value }` with no own `issues` property. A lint rule stops new object-literal Results from appearing. A new ADR records the rule "validation outputs are classes that implement their Standard Schema interface", covering both `Issue` (after the fact) and `Result`.

## User Stories

1. As a pvl consumer, I want `Result<string>` to keep working as the type of a `.validate()` call, so that my annotations don't change.
2. As a pvl consumer, I want `if (result.issues)` to keep narrowing to the failure branch, and its `else` to the success branch, so that existing code keeps type-checking.
3. As a pvl consumer, I want `result.value` to be typed as the Schema's Output on the success branch, so that I never need a cast.
4. As a pvl consumer, I want `result.issues` to be typed as `ReadonlyArray<Issue>` on the failure branch, so that `code` stays readable (ADR-0011).
5. As a pvl consumer, I want `result instanceof Result` to be true for every Result `.validate()` returns, so that I can recognise a pvl Result at runtime.
6. As a pvl consumer, I want `instanceof SuccessResult` and `instanceof FailureResult` to tell the two branches apart, so that I have a runtime check besides `issues`.
7. As a pvl consumer, I want `SuccessResult` and `FailureResult` exported from `@pvl/schema`, so that I can name either branch in my own types.
8. As a pvl consumer, I want a successful Result to have no own `issues` property, so that `'issues' in result` and serialisation behave as they do today.
9. As a pvl consumer, I want a failed Result to carry only `issues` and no `value`, so that it matches the Standard Schema `FailureResult`.
10. As a Standard Schema consumer (a form library, an API framework), I want `"~standard".validate` to keep returning something assignable to `StandardSchemaV1.Result`, so that pvl Schemas plug in with no adapter.
11. As a Standard Schema consumer, I want a success Result's `issues` to be falsy, so that the spec's own success check keeps working.
12. As a pvl consumer, I want `.validate()` to keep never throwing for an invalid value, so that the class change doesn't change error handling.
13. As a pvl maintainer, I want every Result built through `Result.success` / `Result.failure`, so that construction lives in one place.
14. As a pvl maintainer, I want the factories and the branch constructors marked `@internal`, so that they stay out of the public docs like `Issue`'s constructor while generated code can still call them.
15. As a pvl maintainer, I want `Result.failure` to take a `ReadonlyArray<Issue>`, so that the runners and `unionSchema` pass the arrays they already hold without copying.
16. As a pvl maintainer, I want each branch class to `implements` its Standard Schema interface, so that the compiler reports any drift from the spec.
17. As a pvl maintainer, I want a lint error when someone writes a `{ issues: … }` or `{ value: … }` object literal as a Result in `@pvl/schema`'s source, so that plain-object Results can't come back.
18. As a pvl maintainer, I want that lint error to tell me which factory to use, so that the fix is obvious.
19. As a pvl maintainer, I want the internal pre-modifier state (`PreModifiersResult`) left alone, so that the lint rule and the migration only cover real Results.
20. As a schema-compiler maintainer, I want the code-generation specification to say generated code builds Results with `Result.success` / `Result.failure`, so that compiled and interpreted output stay the same class.
21. As a schema-compiler maintainer, I want the differential test (compiled vs interpreted `validate()`) to keep passing, so that the change is invisible on that path.
22. As a pvl maintainer, I want an ADR that records "validation outputs are classes that `implements` their Standard Schema interface, with `@internal` constructors and factories", so that the convention `Issue` set is written down and `Result` follows it.
23. As a pvl maintainer, I want that ADR to explain why the base class's runtime name is `ResultBase`, so that seeing it in a stack trace or in TypeDoc is no surprise.
24. As a pvl maintainer, I want that ADR to list the rejected alternatives (renaming the union to `ValidationResult`, a named class expression, a plain factory object, one class without narrowing), so that nobody re-argues them.
25. As a pvl maintainer, I want ADR-0011 rewritten in place to say `FailureResult` is a class that `implements StandardSchemaV1.FailureResult`, so that its reasoning ("cannot drift from the spec") still matches the code.
26. As a pvl maintainer, I want the Standard Schema specification doc to describe conformance through `implements`, so that it matches the new mechanism.
27. As a pvl maintainer, I want the pipeline specification to say the runners return Results built by the factories, so that the doc and the code agree.
28. As a pvl maintainer, I want the schema testing specification updated for the class-based Result, so that test authors know `toEqual` assertions don't check the class.
29. As a docs reader, I want the user guide's examples to keep showing `Result<string>` and `if (result.issues)`, so that the documented usage is unchanged.
30. As a docs reader, I want the TSDoc on `Result`, `SuccessResult` and `FailureResult` to include `@example`s, so that the generated API reference explains each one.
31. As a pvl maintainer, I want the glossary's **Result** entry to say that `Result` is both the class (value) and the union (type), so that the vocabulary stays accurate.

## Implementation Decisions

- **Shape.** One unexported `abstract class ResultBase` holds two static factories. `SuccessResult<Output>` and `FailureResult` extend it, and each `implements` its Standard Schema interface. The value `Result` is the base class, and the type `Result<Output>` is the union of the branches. A value and a type can share a name in TypeScript, which is what keeps `Result<string>` working. This shape came out of a `/prototype-code` comparison (variant "renamed-base-class"); the decision-rich part:

  ```ts
  abstract class ResultBase {
    /** @internal */ static success<Output>(value: Output): SuccessResult<Output>;
    /** @internal */ static failure(issues: ReadonlyArray<Issue>): FailureResult;
  }
  class SuccessResult<Output> extends ResultBase implements StandardSchemaV1.SuccessResult<Output> {
    declare readonly issues?: undefined;              // spec field, type-only: no own property
    /** @internal */ constructor(readonly value: Output);
  }
  class FailureResult extends ResultBase implements StandardSchemaV1.FailureResult {
    /** @internal */ constructor(readonly issues: ReadonlyArray<Issue>);
  }
  const Result = ResultBase;
  type Result<Output> = SuccessResult<Output> | FailureResult;
  ```

- **Follow the Standard Schema exactly.** `SuccessResult` declares `readonly value: Output` and `readonly issues?: undefined`. The latter is type-only, so at runtime a success is still `{ value }`. `FailureResult` declares only `readonly issues: ReadonlyArray<Issue>`. `implements` replaces ADR-0011's intersection type as the guard against drift.
- **Exports.** `Result` (value and type), `SuccessResult` and `FailureResult`. `ResultBase` is not exported. `FailureResult` was already public as a type, so it moves from type to class. `SuccessResult` is a new export.
- **Visibility.** The factories and the branch constructors are `@internal`: exported and callable, so the Destination File can use them, but left out of TypeDoc. This matches `Issue`'s constructor.
- **Factory signatures.** `Result.success<Output>(value: Output)` and `Result.failure(issues: ReadonlyArray<Issue>)`. Single-issue sites pass a one-element array.
- **Migration, in the same change.** Every Result object literal in `@pvl/schema` switches to the factories: the type-check and Local Modifier code in every Schema, both pipeline runners, `.refine()` and `unionSchema`. `Modifier.fn` keeps its `Result<Output> | null` return type. The internal `PreModifiersResult` isn't a Result and doesn't change.
- **Lint enforcement.** A `no-restricted-syntax` selector, scoped to `@pvl/schema`'s source, reports an object literal whose only property is `issues` or only `value`. Its message names `Result.failure(...)` / `Result.success(...)`. It lands with the migration, so the tree stays green. Per ADR-0022 the convention lives in lint, not in prose.
- **ADR-0023 (new).** Validation outputs are classes that `implements` their Standard Schema interface, with `@internal` constructors and factories the Destination File can call. It records `Issue` after the fact and applies the rule to `Result`. It also explains the `ResultBase` runtime name and lists the rejected alternatives: a `ValidationResult` union name, a named class expression (which can't be `abstract`), a plain factory object (no `instanceof Result`), and a single class (which breaks narrowing).
- **ADR-0011 (rewritten in place)**, the way ADR-0010 and ADR-0016 were. Its decision stays: the failure branch carries pvl's `Issue`, so `code` is reachable. The mechanism becomes a class that `implements StandardSchemaV1.FailureResult`, and the record links to ADR-0023.
- **Docs.** Update the Standard Schema specification (conformance via `implements`), the schema pipeline specification (runners return factory-built Results), the schema testing specification, the schema-compiler code-generation specification (generated code calls the factories, as it already calls `new Issue`), the user guide's schemas page, the TSDoc and `{@link Result}` references in the source, and the glossary's **Result** entry. The TypeDoc API pages regenerate on their own.
- **Glossary.** **Result** stays the term. _Validation Result_ is still on the avoid list, and that list is one reason the union wasn't renamed.

## Testing Decisions

- A good test here asserts what a consumer can see through the public seam: `instanceof` against the exported classes, own-property presence and `.validate()`'s return value. It doesn't look at private structure. The existing tests use `toEqual`, which ignores prototypes, so they keep passing without any edit but say nothing about the class. That is why new tests are needed.
- One new test file for the Result module, with exactly four cases:
  1. `Result.success(v)` is an instance of both `SuccessResult` and `Result`.
  2. `Result.failure(issues)` is an instance of both `FailureResult` and `Result`.
  3. A success Result has no own `issues` property, matching the spec's type-only `issues?: undefined`.
  4. One real `.validate()` call per branch returns those instances. This proves the migration reached the public seam.
- Seams: the existing `schema.validate(input)` → Result seam from the schema testing specification, plus the `Result` factories as public values. No new internal seams.
- Prior art: the per-Schema test files (e.g. the string Schema's tests) for `.validate()` assertions, and the shared test helpers for reading issue codes.
- The schema-compiler's differential test must keep passing without changes.

## Out of Scope

- Instance methods on Results (`isSuccess()`, `unwrap()`, `map()`, …). Q1 settled that the class exists to centralise construction, not to add a public API.
- Changing `Issue` beyond recording it in ADR-0023.
- Changing what `.validate()` or `"~standard".validate` return at runtime, apart from the prototype.
- Async validation.
- The internal `PreModifiersResult` state type.
- Hand-editing the generated TypeDoc API pages.

## Further Notes

- The design was settled in a `/grilling` session (Q1–Q14) and one `/prototype-code` round on the union's name. Its variants were deleted.
- The cost of the chosen shape: TypeScript has no name for "an instance of the base class", because `Result` as a type means the union. Anyone who needs it writes `InstanceType<typeof Result>`.
