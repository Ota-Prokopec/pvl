# Getting started

`@pcvl/schema` describes the shape of a value once, as a schema, and then checks values against it at runtime. The schema is also the type: there is no second declaration to keep in sync.

::: warning Pre-release
Both packages are published as `0.1.0-next.N` prereleases on the `next` dist-tag, so install them with `@next`. `@pcvl/compiler` is optional, and its version must match `@pcvl/schema`'s.
:::

```sh
pnpm add @pcvl/schema@next
pnpm add -D @pcvl/compiler@next
```

## Your first schema

Every schema is built from the `pvl` namespace object — one import, and everything hangs off it.

```ts
import { pvl } from '@pcvl/schema';

const user = pvl.object({
  name: pvl.string().min(1),
  age: pvl.number().int().min(0),
  nickname: pvl.string().optional(),
});
```

Each factory returns a schema, and each method on a schema returns a new schema. Nothing is mutated — `pvl.string()` and `pvl.string().min(1)` are two separate schemas.

Modifiers run in the order you chain them, so order can matter — `pvl.string().coerce().optional()` and `pvl.string().optional().coerce()` treat `undefined` differently. Every schema keeps its own type through every modifier, so `pvl.string().optional().min(2)` works just like `pvl.string().min(2).optional()`. The one exception is `.transform()`, which ends the chain. See [Modifiers](./schemas#modifiers).

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
| `message` | Human-readable prose. Some checks let you replace it, so never match on it.                               |
| `path`    | Where the failure happened, as an array of keys and indices. Omitted entirely for a failure at the root.  |

Objects and arrays check **every** field and element, and every constraint is checked rather than stopping at the first that fails, so one round-trip tells you everything that is wrong:

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

The modifiers that report an issue of their own — the constraints (`.min()`, `.max()`, `.length()`, `.int()`), `.refine()` and `object`'s `.strict()` — take an optional trailing options object. Its `message` replaces the default message for that one check — it is the only way to customise a message. The factories take no options: a type check's message is fixed, so map it by `code` where you display it.

```ts
pvl.string().min(3, { message: 'must be at least 3 characters' });
pvl.number().refine((value) => value % 2 === 0, { message: 'must be even' });
pvl.object({ name: pvl.string() }).strict({ message: 'no extra keys' });
```

## Type inference

A schema carries its own input and output types, so you never declare the shape twice. Read them off the schema with the Standard Schema helper types:

```ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { pvl } from '@pcvl/schema';

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

## Compile it

`@pcvl/compiler` turns a schema into a Compiled Schema ahead of time: plain straight-line code that validates the same values and returns the same `Result`, without walking the schema at runtime. Install it as a devDependency:

```sh
pnpm add -D @pcvl/compiler@next
```

Wrap the schema in `pvl.compile(...)`, in a file under `src/schemas/`:

```ts
// src/schemas/user.ts
import { pvl } from '@pcvl/schema';

export const user = pvl.compile(
  pvl.object({
    name: pvl.string().min(1),
    age: pvl.number().int().min(0),
    nickname: pvl.string().optional(),
  }),
);
```

Run the compiler with `pnpm exec`. Not `npx pvl`: where `@pcvl/compiler` isn't installed, it fetches an unrelated package named `pvl`.

```sh
pnpm exec pvl compile
```

It writes each file to the `.pvl/` folder at the same path, relative to `src/`, so `src/schemas/user.ts` becomes `.pvl/schemas/user.ts`. Import the Compiled Schema from there:

```ts
// src/index.ts
import { user } from '../.pvl/schemas/user.js';

const result = user.validate({ name: 'Ada', age: 36 });
```

Not every schema can be compiled yet: `pvl.union()` can't, and the compiler reports it as `UNSUPPORTED_SCHEMA` and writes nothing. A schema you don't wrap in `pvl.compile(...)` keeps working as written.

The window below runs exactly that project on the published packages. It compiles `src/schemas/user.ts`, validates one passing and one failing value, and prints both `Result`s. Open `.pvl/schemas/user.ts` to read the generated code, and save an edit to compile and run it again.

<iframe
  src="https://stackblitz.com/github/Ota-Prokopec/pvl/tree/main/stackblitz/get-started-docs?embed=1&file=src%2Fschemas%2Fuser.ts&view=editor&terminalHeight=50"
  title="StackBlitz: compile the user schema with @pcvl/compiler and run it"
  loading="lazy"
  style="width: 100%; height: 560px; border: 0; border-radius: 8px; overflow: hidden"
></iframe>

## What comes next

- [Schema types](./schemas) — every factory, constraint and modifier, with examples.
- [API reference](/api/) — generated from the source, one page per exported symbol.
- [Behind the scenes](https://github.com/Ota-Prokopec/pvl/wiki) — the wiki: how every schema and modifier works inside, interpreted and compiled.
