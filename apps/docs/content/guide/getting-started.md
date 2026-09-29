# Getting started

`@pvl/schema` describes the shape of a value once, as a schema, and then checks values against it at runtime. The schema is also the type: there is no second declaration to keep in sync.

::: warning Pre-release — not yet on npm
`@pvl/schema` is still at version `0.0.0` and has **not been published**. The command below is what installation will look like; today it will fail. Until the first release, use the package from a checkout of the repository.
:::

```sh
pnpm add @pvl/schema
```

## Your first schema

Every schema is built from the `pvl` namespace object — one import, and everything hangs off it.

```ts
import { pvl } from '@pvl/schema';

const user = pvl.object({
  name: pvl.string().min(1),
  age: pvl.number().int().min(0),
  nickname: pvl.string().optional(),
});
```

Each factory returns a schema, and each method on a schema returns a new schema. Nothing is mutated — `pvl.string()` and `pvl.string().min(1)` are two separate schemas.

Chaining order never changes what a schema validates, but on a primitive it does decide what you can chain next: `.optional()`, `.nullable()`, `.coerce()` and `.transform()` hand back the base `Schema`, so put a type's own constraints (`.min()`, `.max()`, `.length()`, `.int()`) before them. See [the note under Modifiers](./schemas#modifiers).

See [Schema types](./schemas) for the full set of factories and modifiers.

## Reading a `Result`

`validate()` checks a value and hands back a `Result`. It is synchronous, and it **never throws for an invalid value** — a rejection is data, like a success is.

A `Result` is a union of two branches, told apart by whether `issues` is present:

```ts
const result = user.validate({ name: 'Ada', age: 36 });

if (result.issues) {
  // The failing branch: every reason the value was rejected.
  for (const issue of result.issues) {
    console.log(issue.code, issue.path, issue.message);
  }
} else {
  // The succeeding branch: `result.value` is typed, not `unknown`.
  console.log(result.value.name);
}
```

Check `issues` first. TypeScript narrows on it, so inside the `else` branch `result.value` carries the schema's output type.

### What is in an `Issue`

| Field     | What it is                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `code`    | A stable [`IssueCode`](/api/type-aliases/IssueCode) such as `INVALID_TYPE` or `TOO_SMALL`. Match on this. |
| `message` | Human-readable prose. Replaceable per call site, so never match on it.                                    |
| `path`    | Where the failure happened, as an array of keys and indices. Omitted entirely for a failure at the root.  |

Objects and arrays check **every** field and element rather than stopping at the first failure, so one round-trip tells you everything that is wrong:

```ts
const result = user.validate({ name: '', age: 1.5 });

if (result.issues) {
  console.log(result.issues.length); // 2
  console.log(result.issues[0]?.path); // [ 'name' ]
  console.log(result.issues[1]?.code); // 'NOT_INTEGER'
}
```

Nested structures compose their paths, so a bad element inside an array inside an object reports something like `['contacts', 2, 'email']`.

### Custom messages

Every factory and every constraint method takes an optional trailing options object. Its `message` replaces the default message for that one check — it is the only way to customise a message.

```ts
pvl.string({ message: 'name must be text' });
pvl.string().min(3, { message: 'must be at least 3 characters' });
pvl.object({ name: pvl.string() }, { message: 'invalid payload' });
```

## Type inference

A schema carries its own input and output types, so you never declare the shape twice. Read them off the schema with the Standard Schema helper types:

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { pvl } from '@pvl/schema';

const user = pvl.object({
  name: pvl.string(),
  nickname: pvl.string().optional(),
});

type User = StandardSchemaV1.InferOutput<typeof user>;
// { name: string; nickname?: string | undefined }
```

::: tip
`@standard-schema/spec` is a types-only package — it contributes no runtime code. Add it to your own `devDependencies` to import those helpers directly.
:::

**Input and output are two different types**, and they diverge as soon as a `.transform()` is involved:

```ts
const slug = pvl.string().transform((value) => value.trim().toLowerCase());

type SlugInput = StandardSchemaV1.InferInput<typeof slug>; // string
type SlugOutput = StandardSchemaV1.InferOutput<typeof slug>; // string

const count = pvl.string().transform((value) => value.length);

type CountInput = StandardSchemaV1.InferInput<typeof count>; // string
type CountOutput = StandardSchemaV1.InferOutput<typeof count>; // number
```

A field whose schema is `.optional()` becomes an optional _key_ in the composed object type, not merely a key that may be `undefined` — and at runtime an omitted key stays omitted from the output rather than appearing as an explicit `undefined`.

## What comes next

- [Schema types](./schemas) — every factory, constraint and modifier, with examples.
- [API reference](/api/) — generated from the source, one page per exported symbol.
