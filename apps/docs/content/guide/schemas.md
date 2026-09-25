# Schema types

Every schema is built from the `pvl` namespace object, and every method on a schema returns a new schema — nothing is mutated, so a base schema can be reused and specialised independently.

```ts
import { pvl } from '@pvl/schema';
```

The constraint methods below are deliberately cheap and structural — plain numeric and length comparisons. There is no built-in `.email()`, `.url()` or `.regex()`; a check like that is yours to attach with [`.refine()`](#refine).

Constraints on a single schema are checked in the order they were chained and **stop at the first failure**, so one schema produces at most one `Issue`. Composites are different: `object` and `array` check every field and element and report all of them.

## `string`

Accepts a JavaScript `string`.

```ts
const username = pvl.string().min(3).max(20);

username.validate('ada'); // { value: 'ada' }
username.validate('ad'); // { issues: [{ code: 'TOO_SMALL', ... }] }
username.validate(42); // { issues: [{ code: 'INVALID_TYPE', ... }] }
```

| Method       | Issue code       | What it requires         |
| ------------ | ---------------- | ------------------------ |
| `.min(n)`    | `TOO_SMALL`      | At least `n` characters. |
| `.max(n)`    | `TOO_BIG`        | At most `n` characters.  |
| `.length(n)` | `INVALID_LENGTH` | Exactly `n` characters.  |

Lengths are `String.prototype.length`, i.e. UTF-16 code units. `.coerce()` converts a `number`, `boolean` or `bigint` input with `String()`.

## `number`

Accepts a JavaScript `number` — floats and integers alike, since JavaScript has only one numeric type.

```ts
const age = pvl.number().int().min(0).max(130);

age.validate(36); // { value: 36 }
age.validate(36.5); // { issues: [{ code: 'NOT_INTEGER', ... }] }
```

| Method    | Issue code    | What it requires                        |
| --------- | ------------- | --------------------------------------- |
| `.min(n)` | `TOO_SMALL`   | A value `>= n`. The bound is inclusive. |
| `.max(n)` | `TOO_BIG`     | A value `<= n`. The bound is inclusive. |
| `.int()`  | `NOT_INTEGER` | A whole number, per `Number.isInteger`. |

Two things this schema does not do:

- **`NaN` is rejected**, despite `typeof NaN === 'number'`. An accepted `NaN` would silently fail every `.min()`/`.max()` comparison instead of producing a clear `INVALID_TYPE` issue.
- **`Infinity` and `-Infinity` are accepted** — there is no built-in finiteness constraint. Add one with `.refine(Number.isFinite)` if you need it.

Arbitrary-precision integers are [`bigint`](#bigint)'s job; this schema never accepts or produces one. `.coerce()` converts a `string` or `boolean` input with `Number()`, and an unparseable string becomes `NaN`, which is then rejected.

## `bigint`

Accepts a real JavaScript `bigint` and nothing else, so it never overlaps with `number`.

```ts
const fileSize = pvl.bigint().min(0n);

fileSize.validate(9007199254740993n); // { value: 9007199254740993n }
fileSize.validate(42); // { issues: [{ code: 'INVALID_TYPE', ... }] }
```

| Method    | Issue code  | What it requires                                |
| --------- | ----------- | ----------------------------------------------- |
| `.min(n)` | `TOO_SMALL` | A value `>= n`, where `n` is itself a `bigint`. |
| `.max(n)` | `TOO_BIG`   | A value `<= n`, where `n` is itself a `bigint`. |

There is no `.int()` — a `bigint` has no fractional form for it to reject. The output stays a real `bigint` and is never downgraded to a `number`, which would reintroduce exactly the precision loss `bigint` exists to avoid.

`.coerce()` accepts a `string` or `number` and converts with native `BigInt()`. An input `BigInt()` refuses — a malformed string like `'12.5'`, or a number with a fractional part — falls through unchanged and is rejected by the type check rather than throwing.

```ts
pvl.bigint().coerce().validate('42'); // { value: 42n }
pvl.bigint().coerce().validate('12.5'); // { issues: [{ code: 'INVALID_TYPE', ... }] }
```

## `boolean`

Accepts a JavaScript `boolean`. There is nothing to constrain beyond the type, so it has no check methods of its own.

```ts
pvl.boolean().validate(false); // { value: false }
pvl.boolean().validate('false'); // { issues: [{ code: 'INVALID_TYPE', ... }] }
```

When only one of the two values will do, reach for [`literal`](#literal) instead:

```ts
const mustAcceptTerms = pvl.literal(true);
```

::: warning `.coerce()` here is plain truthiness
`pvl.boolean().coerce()` converts with `Boolean()`, so **every non-empty string is `true`** — including `'false'` and `'0'`. If you are reading booleans out of query strings or environment variables, a `pvl.enum(['true', 'false']).transform((value) => value === 'true')` says what you mean.
:::

## `literal`

Matches exactly one constant value: a `string`, `number`, `boolean` or `bigint`.

```ts
const owner = pvl.literal('OWNER');

owner.validate('OWNER'); // { value: 'OWNER' }
owner.validate('MEMBER'); // { issues: [{ code: 'INVALID_VALUE', ... }] }
```

A right-shaped value of the wrong type is rejected just like a wrong value is — `pvl.literal(42)` rejects `'42'`.

The comparison is `Object.is`, not `===`, which matters for the two values they disagree about: `pvl.literal(0)` **rejects** `-0` rather than accepting it and handing back `0`, and `pvl.literal(NaN)` **matches** `NaN` rather than being a schema nothing can satisfy.

Because a literal pins the schema to one primitive type, `.coerce()` has an unambiguous target: the input is converted exactly as the matching primitive schema would convert it, and then compared.

Literals are also how a union gets a discriminant:

```ts
const event = pvl.union([
  pvl.object({ type: pvl.literal('created'), id: pvl.string() }),
  pvl.object({ type: pvl.literal('deleted'), id: pvl.string() }),
]);
```

## `enum`

Accepts one of a fixed set of values. There are two source forms, and both produce the same kind of schema — only what you hand the factory differs.

An `as const` enum object, when the set already has a name:

```ts
const SYSTEM_ROLE = { OWNER: 'OWNER', MEMBER: 'MEMBER' } as const;

const role = pvl.enum(SYSTEM_ROLE);

role.validate('OWNER'); // { value: 'OWNER' }
role.validate('GUEST'); // { issues: [{ code: 'INVALID_VALUE', ... }] }
```

Or an array of string literals, for an ad hoc set that does not warrant one:

```ts
const size = pvl.enum(['small', 'medium', 'large']);
```

Membership is a `Set` lookup rather than a scan, so the check stays O(1) however large the set is. `.coerce()` is inherited but does nothing here: an enum object may mix string and number members, so there is no single target type to convert an input to.

## `array`

Validates every element against one shared item schema.

```ts
const tags = pvl.array(pvl.string()).min(1).max(5);

tags.validate(['a', 'b']); // { value: ['a', 'b'] }
```

| Method       | Issue code       | What it requires       |
| ------------ | ---------------- | ---------------------- |
| `.min(n)`    | `TOO_SMALL`      | At least `n` elements. |
| `.max(n)`    | `TOO_BIG`        | At most `n` elements.  |
| `.length(n)` | `INVALID_LENGTH` | Exactly `n` elements.  |

**Elements are independent.** Every element is checked even after an earlier one fails, so one `Result` carries one `Issue` per failing element, each pathed with its numeric index:

```ts
const result = tags.validate(['a', 2, 3]);
// { issues: [{ path: [1], ... }, { path: [2], ... }] }
```

The length constraints above are checks on the array itself, so — unlike the element checks — they stop at the first failure and are reported instead of, not alongside, element issues.

`.coerce()` is inherited but does nothing: there is no unambiguous way to read an array out of a non-array, so a value that is not one is rejected rather than guessed at.

## `object`

Validates each declared key against its own field schema.

```ts
const user = pvl.object({
  name: pvl.string().min(1),
  age: pvl.number().int().min(0),
  nickname: pvl.string().optional(),
});
```

**Every field is checked**, so one `Result` reports every failing field rather than one per round-trip, each pathed to its key:

```ts
user.validate({ name: '', age: 1.5 });
// { issues: [{ path: ['name'], ... }, { path: ['age'], ... }] }
```

Each field runs through its own full pipeline — its `.optional()`, `.nullable()`, `.coerce()`, `.refine()` and `.transform()` all apply — and nested objects and arrays compose their path segments, so a failure deep inside reports exactly where it happened.

### Unknown keys

Keys the shape does not declare are **stripped** by default:

```ts
user.validate({ name: 'Ada', age: 36, extra: true });
// { value: { name: 'Ada', age: 36 } }
```

Two modifiers change that, and exactly one mode is active per schema — the last one applied wins.

`.strict()` reports each undeclared key as an `UNRECOGNIZED_KEY` issue pathed to that key. Use it where an unexpected key means a typo or a stale caller rather than harmless extra data.

```ts
const config = pvl.object({ port: pvl.number() }).strict();

config.validate({ port: 80, prot: 443 });
// { issues: [{ code: 'UNRECOGNIZED_KEY', path: ['prot'], ... }] }
```

`.passthrough()` keeps undeclared keys, untyped. The output type gains an `unknown`-valued index signature, so reading one still forces a narrowing step.

```ts
const envelope = pvl.object({ id: pvl.string() }).passthrough();

envelope.validate({ id: 'a1', meta: { source: 'api' } });
// { value: { id: 'a1', meta: { source: 'api' } } }
```

`.coerce()` is inherited but does nothing on an object: there is no unambiguous way to read an object out of a non-object. A field that needs coercion opts into it on its own schema.

## `union`

Tries each member schema in the order given and succeeds on the first that accepts the value.

```ts
const id = pvl.union([pvl.string(), pvl.number().int()]);

id.validate('a1'); // { value: 'a1' }
id.validate(7); // { value: 7 }
```

Order matters where two members overlap: the first match wins, and its output is the union's output.

Every member is attempted — there is no discriminated-union fast path that dispatches on a shared key, so a `type`-tagged union works but is not optimised as one.

When no member accepts the value, the issues are **every member's own rejection**, collected rather than replaced with one generic message:

```ts
id.validate(true);
// { issues: [{ code: 'INVALID_TYPE', message: 'Expected string' }, { ... 'Expected number' }] }
```

Where that detail would be noise, `{ message }` collapses it into a single `INVALID_UNION` issue:

```ts
const quiet = pvl.union([pvl.string(), pvl.number()], { message: 'expected an id' });

quiet.validate(true);
// { issues: [{ code: 'INVALID_UNION', message: 'expected an id' }] }
```

Each member is validated at the same path as the union itself — a member is an alternative, not a nested field, so no path segment is appended the way `object` and `array` append a key or index. `.coerce()` is inherited but does nothing: the members may be unrelated types, so there is no single conversion target.

## Modifiers

These five are on **every** schema, primitive or composite, because they are orthogonal to what a schema's own shape check does.

They run in a fixed order within one `validate()` call: `.coerce()` first, then the `.optional()`/`.nullable()` short-circuit, then the schema's own type and constraint checks, and finally the `.refine()`/`.transform()` steps in the order they were chained.

### `.optional()`

Accepts `undefined` in addition to whatever the schema already accepts. As an object field, it also makes the key itself optional — and an omitted key stays omitted from the output rather than becoming an explicit `undefined` property.

```ts
const user = pvl.object({ name: pvl.string(), nickname: pvl.string().optional() });

user.validate({ name: 'Ada' }); // { value: { name: 'Ada' } }
```

### `.nullable()`

Accepts `null`. Unlike `.optional()`, the key stays required — `null` has to be passed explicitly. Chain both to accept either.

```ts
const deletedAt = pvl.string().nullable();
deletedAt.validate(null); // { value: null }

const eitherWay = pvl.string().nullable().optional();
```

### `.refine()`

Attaches a custom check that runs **after** the schema's own checks pass, so the predicate only ever sees a value this schema accepted. It never changes the value; returning `false` produces a `CUSTOM` issue.

This is where a constraint the library has no built-in for belongs — a regex, a finiteness check, a rule spanning two fields.

```ts
const evenNumber = pvl.number().refine((value) => value % 2 === 0, { message: 'must be even' });

evenNumber.validate(3); // { issues: [{ code: 'CUSTOM', message: 'must be even' }] }

const email = pvl.string().refine((value) => value.includes('@'), { message: 'not an email' });
```

A failing refinement short-circuits the remaining steps. It never throws — a rejection is an `Issue`, as everywhere else.

### `.transform()`

Converts an accepted value into a different one, changing the schema's `Output` type to whatever the function returns. It also runs after validation passes, so like `.refine()` it never sees a value the schema rejected.

```ts
const trimmedLength = pvl.string().transform((value) => value.trim().length);

trimmedLength.validate('  hello  '); // { value: 5 }
trimmedLength.validate(42); // { issues: [...] } — never reaches the transform
```

Refinements and transforms run in exactly the order they were chained, so a later `.refine()` observes an earlier `.transform()`'s output:

```ts
const shortSlug = pvl
  .string()
  .transform((value) => value.trim().toLowerCase())
  .refine((value) => value.length <= 20, { message: 'slug too long' });
```

### `.coerce()`

Converts the raw input to the schema's type **before** any check runs, so `'42'` can satisfy a number schema. This is the one modifier that runs first rather than last — which is why a coercion failure and a check failure compose predictably: coercion always resolves before the check sees anything.

```ts
const port = pvl.number().int().min(1).coerce();

port.validate('8080'); // { value: 8080 }
port.validate('nope'); // { issues: [{ code: 'INVALID_TYPE', ... }] }
```

A coercion never produces an `Issue` of its own. An input it cannot convert is handed through unchanged, and the schema's normal check is what rejects it.

Only the four primitives and `literal` have a conversion. On `object`, `array`, `union` and `enum` there is no unambiguous target type, so `.coerce()` is a no-op — it is available for uniformity, not because it does something there.

| Schema    | `.coerce()` accepts           | Via                                  |
| --------- | ----------------------------- | ------------------------------------ |
| `string`  | `number`, `boolean`, `bigint` | `String(value)`                      |
| `number`  | `string`, `boolean`           | `Number(value)`                      |
| `boolean` | `string`, `number`, `bigint`  | `Boolean(value)` — plain truthiness  |
| `bigint`  | `string`, `number`            | `BigInt(value)`, with a throw caught |
| `literal` | whatever its own type accepts | the matching primitive's conversion  |

### Coercion is not transformation

The two are easy to confuse and sit on opposite sides of the check:

- **`.coerce()`** runs _before_ validation, on the raw input, to make a wrong-typed value acceptable.
- **`.transform()`** runs _after_ validation, on an accepted value, to turn it into something else.

## What comes next

- [API reference](/api/) — generated from the source, one page per exported symbol.
