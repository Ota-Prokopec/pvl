# Testing `@pvl/schema`

This documents the testing strategy for `@pvl/schema`, agreed alongside the design decisions in [`AGENTS.md`](./AGENTS.md). Follow it as-is rather than re-deriving a test approach per schema type — consistency here matters more than any one file's local preference.

Good tests verify behavior through the public interface only — feed a schema an input, assert on what `.validate()` (or the type system) reports — never by reaching into how a schema represents itself internally (no asserting on private fields, internal tree shape, etc.). This is a from-scratch package with no prior in-repo test suite to match; the closest prior art is this repo's own `tdd` skill (seam discipline, anti-patterns) and the bundled `zod` skill's `references/testing.md`/`testing-api.md` — useful specifically because `@pvl/schema` is itself a Zod-style library and shares the same shape of correctness/error-message/edge-case testing concerns, even though the concrete API (`.validate()` returning a Standard-Schema `Result`, not `.safeParse()` returning a Zod-shaped result) differs.

## Runner

[Vitest](https://vitest.dev). [`fast-check`](https://fast-check.dev) is a dev dependency used for property-based tests on primitives and composite combinators — see below.

## Test file placement

Tests live in a separate top-level `tests/` directory, **not** colocated with source (no `*.test.ts` next to the file it tests under `src/`). Test files are named `*.test.ts`. This keeps `src/` free of test files and gives the suite one predictable place to grow as the package does.

```
packages/schema/
├── src/
│   └── ...
└── tests/
    ├── string.test.ts
    ├── object.test.ts
    ├── standard-schema-types.test.ts
    ├── compile.test.ts
    └── ...
```

## The four test seams

Every schema type is exercised through these four seams. Not every seam applies to every schema (e.g. seam 3 only applies to `pvl.compile()` itself), but no schema type ships without seam 1 coverage, and composite types (`object`, `array`, `union`) need seam 4 coverage for their nested-failure behavior.

### 1. `schema.validate(input)` → `Result`

The primary, uniform seam. Every schema type — primitive or composite — is tested by feeding it inputs and asserting on the returned `Result`/`Issue[]`, covering both the accept and reject paths. This is where constraint (`.min()`/`.max()`/`.length()`/`.int()`), `.refine()`, `.transform()`, `.coerce()`, `.optional()`, and `.nullable()` behavior gets covered — for each, test both a value that should pass and one that should fail, plus the boundary itself for numeric/length constraints (e.g. exactly `min`, exactly `max`).

```ts
import { describe, it, expect } from 'vitest';
import { pvl } from '../src/index.js';

describe('pvl.string()', () => {
  it('accepts a string', () => {
    const result = pvl.string().validate('hello');
    expect(result.issues).toBeUndefined();
  });

  it('rejects a non-string', () => {
    const result = pvl.string().validate(42);
    expect(result.issues).toBeDefined();
  });

  it('accepts the exact min boundary', () => {
    const result = pvl.string().min(3).validate('abc');
    expect(result.issues).toBeUndefined();
  });

  it('rejects one below the min boundary', () => {
    const result = pvl.string().min(3).validate('ab');
    expect(result.issues).toBeDefined();
  });
});
```

Never assert `.validate()` throws for an invalid value — it doesn't, by contract (see `AGENTS.md`). A test written as `expect(() => schema.validate(x)).toThrow()` is testing the wrong thing even if it happens to pass.

### 2. Type-level inference

`expectTypeOf`-style (or tsd-style) tests asserting that `StandardSchemaV1.InferInput`/`InferOutput` produce the expected static type for representative schemas — a seam runtime tests can't cover. Cover at minimum: a primitive, an `object`, and a `.transform()`'d schema where `Input !== Output`.

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { StandardSchemaV1 } from 'some-standard-schema-types-source';
import { pvl } from '../src/index.js';

describe('type inference', () => {
  it('infers string input/output', () => {
    const schema = pvl.string();
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<string>();
  });

  it("infers a transform's differing input/output", () => {
    const schema = pvl.string().transform((s) => s.length);
    expectTypeOf<StandardSchemaV1.InferInput<typeof schema>>().toEqualTypeOf<string>();
    expectTypeOf<StandardSchemaV1.InferOutput<typeof schema>>().toEqualTypeOf<number>();
  });
});
```

### 3. `pvl.compile()` identity behavior

A direct test that `pvl.compile(schema)` returns the schema unchanged before any compilation has run. Tested as its own seam, not incidentally via `.validate()` on a compiled schema, because this v1 guarantee (see `AGENTS.md`) is easy to silently regress if it's only ever exercised indirectly.

```ts
import { describe, it, expect } from 'vitest';
import { pvl } from '../src/index.js';

describe('pvl.compile()', () => {
  it('returns the given composite schema unchanged pre-compilation', () => {
    const schema = pvl.object({ name: pvl.string() });
    expect(pvl.compile(schema)).toBe(schema);
  });
});
```

### 4. `Issue[]` shape on nested failures

Direct assertions on the exact `Issue.message`/`Issue.path` produced for nested `object`/`array`/`union` validation failures — a seam distinct from a bare pass/fail check on `Result`. Consumers rely on precise error paths to point a user at exactly which field failed, so this is verified explicitly rather than left to an incidental pass/fail assertion.

```ts
import { describe, it, expect } from 'vitest';
import { pvl } from '../src/index.js';

describe('nested Issue paths', () => {
  it("reports the failing field's path for a nested object", () => {
    const schema = pvl.object({ user: pvl.object({ name: pvl.string() }) });
    const result = schema.validate({ user: { name: 42 } });
    expect(result.issues?.[0]?.path).toEqual(['user', 'name']);
  });

  it('reports the failing index for an array', () => {
    const schema = pvl.array(pvl.string());
    const result = schema.validate(['a', 42, 'c']);
    expect(result.issues?.[0]?.path).toEqual([1]);
  });
});
```

## Property-based testing (fast-check)

`fast-check` is used for **primitives and composite combinators** specifically — hand-written examples tend to miss the boundary/edge-case bugs this library exists to catch (off-by-one boundaries on `.min()`/`.max()`, unusual-but-valid strings/numbers, deeply nested `object`/`array` shapes). It isn't required for every schema type; reach for it where an arbitrary-input generator materially strengthens coverage over hand-picked examples, e.g.:

```ts
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { pvl } from '../src/index.js';

describe('pvl.string().min()/.max() (property-based)', () => {
  it('accepts any string within [min, max] length', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 3, maxLength: 10 }), (value) => {
        const result = pvl.string().min(3).max(10).validate(value);
        return result.issues === undefined;
      }),
    );
  });
});
```

## What not to test

- Internal schema representation (private fields, the shape of an internal tree) — test through `.validate()` and type inference only.
- `.validate()` throwing — it never does for a bad value; asserting otherwise tests a contract this library explicitly doesn't have.
- Anything in `@pvl/schema-compiler`'s actual compiled output — out of scope for this package's suite entirely (see `AGENTS.md`'s "Still open" pointer and the parent spec's Out of Scope section); this package's compile-related coverage stops at seam 3's pre-compilation identity behavior.
