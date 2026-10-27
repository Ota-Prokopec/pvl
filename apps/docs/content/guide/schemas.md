# Schema types

Every schema is built from the `pvl` namespace object, and every method on a schema returns a new schema — nothing is mutated, so a base schema can be reused and specialised independently.

```ts
import { pvl } from '@pvl/schema';
```

The constraint methods below are deliberately cheap and structural — plain numeric and length comparisons. There is no built-in `.email()`, `.url()` or `.regex()`; a check like that is yours to attach with [`.refine()`](#refine).

Constraints are checked in the order they were chained, once the value has passed the schema's type check, and **every one that fails is reported**: `pvl.string().min(5).length(3)` given `'ab'` reports both `TOO_SMALL` and `INVALID_LENGTH`. A value of the wrong type reports only the type issue, since its constraints would have nothing meaningful to check. `object` and `array` likewise check every field and element and report all of them.

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

Lengths are `String.prototype.length`, i.e. UTF-16 code units. `.coerce()` converts any input with `String()` — `undefined` becomes `'undefined'` — so chain `.optional()` or `.nullable()` before it to keep those as they are.

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

Membership is a `Set` lookup rather than a scan, so the check stays O(1) however large the set is. There is no `.coerce()`: an enum object may mix string and number members, so there is no single target type to convert an input to.

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

The length constraints above are checks on the array itself, so they run only once every element has passed: an array with a failing element reports the element issues, never a length issue alongside them.

There is no `.coerce()`: there is no unambiguous way to read an array out of a non-array, so a value that is not one is rejected rather than guessed at. An item that needs coercion opts into it on its own schema.

### Reaching the item schema with `element`

`element` hands back the item schema an array schema was built with, so one item can be validated on its own without building a whole array around it:

```ts
const users = pvl.array(pvl.object({ name: pvl.string() }));

users.element.validate({ name: 'Ada' }); // { value: { name: 'Ada' } }
```

It is the schema instance you declared, not a copy, so its own modifiers come with it, and it stays reachable through the length constraints, the modifiers, `.standalone()` and `pvl.compile()` (`pvl.array(item).min(1).element` is still `item`), but not `.transform()`. Every array has one, whether or not its item is marked [`.standalone()`](#standalone): the marker only decides whether a compiled array's `element` is compiled too. It is read-only — it cannot be replaced — and reading it never affects how the array schema validates.

Because an object item carries its own [`shape`](#reaching-a-field-schema-with-shape) and an array item its own `element`, nested structure is reachable all the way down, through the keys marked `.standalone()`:

```ts
const people = pvl.array(pvl.object({ name: pvl.string().standalone() }));

people.element.shape.name.validate(42);
// { issues: [{ code: 'INVALID_TYPE', ... }] }
```

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

Two modifiers change that, and exactly one mode is active per schema — the last one chained wins. There is no `.strip()`: stripping is what you get without either.

`.strict()` reports each undeclared key as an `UNRECOGNIZED_KEY` issue pathed to that key. Use it where an unexpected key means a typo or a stale caller rather than harmless extra data.

```ts
const config = pvl.object({ port: pvl.number() }).strict();

config.validate({ port: 80, prot: 443 });
// { issues: [{ code: 'UNRECOGNIZED_KEY', path: ['prot'], ... }] }
```

Undeclared keys are reported only once every declared field passed; an object with a failing field reports the field issues alone.

`.passthrough()` keeps undeclared keys, untyped. The output type gains an `unknown`-valued index signature, so reading one still forces a narrowing step.

```ts
const envelope = pvl.object({ id: pvl.string() }).passthrough();

envelope.validate({ id: 'a1', meta: { source: 'api' } });
// { value: { id: 'a1', meta: { source: 'api' } } }
```

Unlike every other modifier, these two set the mode for the whole schema rather than acting where they are chained, so a [`.refine()`](#refine) sees the value in the schema's mode wherever it sits in the chain:

```ts
const tagged = pvl.object({ id: pvl.string() });

tagged.refine((value) => 'meta' in value).validate({ id: 'a', meta: 1 }); // CUSTOM issue: `meta` was stripped
tagged
  .refine((value) => 'meta' in value)
  .passthrough()
  .validate({ id: 'a', meta: 1 }); // passes
```

There is no `.coerce()` on an object: there is no unambiguous way to read an object out of a non-object. A field that needs coercion opts into it on its own schema.

### Reaching a field schema with `shape`

`shape` hands back the schema of each key you marked `.standalone()` — a **Standalone Key** — so that one field can be validated on its own without validating the whole object. A key you did not mark is not in it: reading it is a compile error, never an `undefined` at runtime, and an object with no marked key has `shape: {}`.

```ts
const account = pvl.object({
  email: pvl.string().min(3).standalone(),
  age: pvl.number().int(),
});

account.shape.email.validate('a@b.c'); // { value: 'a@b.c' }
account.shape.email.validate('ab'); // { issues: [{ code: 'TOO_SMALL', ... }] }
// account.shape.age — a compile error: `age` isn't a Standalone Key
```

Each field is the schema instance you declared, not a copy, so its own modifiers come with it, and validating it alone gives the Result it gives inside the object, minus the key on each Issue's path. The shape stays reachable through `.strict()`, `.passthrough()`, the modifiers, `.standalone()` and `pvl.compile()` (`account.strict().shape.email` is still `account.shape.email`), but not `.transform()`. It is read-only — neither the shape nor any one field can be replaced — and reading a field never affects how the object schema validates.

A nested object's own `shape` follows the same rule, so it is reachable only when the nested key is itself marked:

```ts
const order = pvl.object({
  customer: pvl.object({ city: pvl.string().standalone() }).standalone(),
  items: pvl.array(pvl.string()).standalone(),
});

order.shape.customer.shape.city.validate('London'); // { value: 'London' }
order.shape.items.element.validate(42); // { issues: [{ code: 'INVALID_TYPE', ... }] }
```

`shape` is the same before and after `@pvl/schema-compiler` compiles the object: a compiled object exposes exactly the Standalone Keys, each as a compiled validator of its own, so swapping the import to the compiled schemas never changes what compiles. That is why `shape` is opt-in: a compiled validator for every key of every object would grow the generated code with keys nobody validates alone.

### `.standalone()`

`.standalone()` marks a schema as a Standalone Key, and changes nothing about what it accepts or the Issues it reports. The schema comes back as the same type, marked, so the chain goes on: `pvl.string().standalone().min(3)` and `pvl.string().min(3).standalone()` are the same Standalone Key, and every modifier after it, `.transform()` included, keeps the mark. It keeps an object's `shape` and an array's `element`. It is valid on any schema, a field or not — a schema marked in one file can be used as a field in another — and on the result of `.transform()` or `pvl.compile()`, where `pvl.compile(x.standalone())` and `pvl.compile(x).standalone()` mean the same. Calling it twice changes nothing.

## `union`

Tries each member schema in the order given and succeeds on the first that accepts the value.

```ts
const id = pvl.union([pvl.string(), pvl.number().int()]);

id.validate('a1'); // { value: 'a1' }
id.validate(7); // { value: 7 }
```

Order matters where two members overlap: the first match wins, and its output is the union's output.

Every member is attempted — there is no discriminated-union fast path that dispatches on a shared key, so a `type`-tagged union works but is not optimised as one.

When no member accepts the value, the issues are one `INVALID_UNION` issue for the union as a whole, followed by **every member's own rejection**, in member order:

```ts
id.validate(true);
// { issues: [
//   { code: 'INVALID_UNION', message: 'Value matches no union member' },
//   { code: 'INVALID_TYPE', message: 'Expected string' },
//   { code: 'INVALID_TYPE', message: 'Expected number' },
// ] }
```

Each member is validated at the same path as the union itself — a member is an alternative, not a nested field, so no path segment is appended the way `object` and `array` append a key or index. There is no `.coerce()`: the members may be unrelated types, so there is no single conversion target. A member that needs coercion opts into it on its own schema.

## Modifiers

This section documents the **shared** modifiers — `.optional()`, `.nullable()`, `.refine()` and `.transform()` — and `.coerce()`, which only the four primitives and `literal` have. `object`'s `.strict()` and `.passthrough()` are modifiers too, but they belong to `object` alone and are documented [with it](#unknown-keys).

The four shared ones are on **every** schema, primitive or composite, because they are orthogonal to what a schema's own shape check does.

**Modifiers run in the order you chain them**, on either side of the schema's type check: `.optional()`, `.nullable()` and `.coerce()` run before it, the constraints, `.refine()`, `.strict()`/`.passthrough()` and `.transform()` after it. So where you chain one can change what a schema does — see [`.coerce()`](#coerce). `object`'s `.strict()`/`.passthrough()` are the exception: they set the mode for the whole schema ([unknown keys](#unknown-keys)).

Every schema keeps its own type through every modifier, so a type's own constraints stay chainable in any position:

```ts
pvl.string().min(3).optional(); // fine
pvl.string().optional().min(3); // also fine — still a string schema
```

`.transform()` is the exception: it ends the chain (see [below](#transform)). [`.standalone()`](#standalone) isn't one: it hands back the same schema type, marked.

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

Attaches a custom check that runs **after** the schema's type check passes, so the predicate only ever sees a value of the right type. It never changes the value; returning `false` produces a `CUSTOM` issue. It is skipped for a value `.optional()` or `.nullable()` accepted.

This is where a constraint the library has no built-in for belongs — a regex, a finiteness check, a rule spanning two fields.

```ts
const evenNumber = pvl.number().refine((value) => value % 2 === 0, { message: 'must be even' });

evenNumber.validate(3); // { issues: [{ code: 'CUSTOM', message: 'must be even' }] }

const email = pvl.string().refine((value) => value.includes('@'), { message: 'not an email' });
```

It runs in chain order among the constraints, and a failing refinement does not stop the ones after it — every failing check is reported. It never throws — a rejection is an `Issue`, as everywhere else.

### `.transform()`

Converts an accepted value into a different one, changing the schema's `Output` type to whatever the function returns. It is the last thing to run, and only once nothing has failed, so it never sees a value the schema rejected.

```ts
const trimmedLength = pvl.string().transform((value) => value.trim().length);

trimmedLength.validate('  hello  '); // { value: 5 }
trimmedLength.validate(42); // { issues: [...] } — never reaches the transform
```

A value `.optional()` or `.nullable()` accepted still reaches it, so the function's parameter includes `undefined` or `null` when those are chained first:

```ts
const label = pvl
  .string()
  .nullable()
  .transform((value) => value ?? 'none');

label.validate(null); // { value: 'none' }
```

`.transform()` **ends the chain**. It returns a plain `Schema`, which can validate and can be a field, element or union member of another schema, but takes no further modifier — a transformed value can be anything, so nothing the schema knew about its type still holds. Chain constraints and refinements before it:

```ts
const shortSlug = pvl
  .string()
  .refine((value) => value.trim().length <= 20, { message: 'slug too long' })
  .transform((value) => value.trim().toLowerCase());
```

A transformed `object` has no `shape`, and a transformed `array` no `element`: they describe a value the transform replaces with whatever it returns. Keep a reference to a field's or item's schema to validate it on its own.

### `.coerce()`

Converts the raw input to the schema's type **before** the type check runs, so `'42'` can satisfy a number schema. Constraints always run after the type check, so it does not matter whether you chain it before or after them.

```ts
const port = pvl.number().int().min(1).coerce();

port.validate('8080'); // { value: 8080 }
port.validate('nope'); // { issues: [{ code: 'INVALID_TYPE', ... }] }
```

A coercion never produces an `Issue` of its own. An input it cannot convert is handed through unchanged, and the schema's normal check is what rejects it.

Where it sits against `.optional()` and `.nullable()` does matter, since those run before the type check too. Chained first, `.coerce()` converts `undefined` before `.optional()` sees it; chained after, `.optional()` accepts `undefined` as it is:

```ts
pvl.string().coerce().optional().validate(undefined); // { value: 'undefined' }
pvl.string().optional().coerce().validate(undefined); // { value: undefined }
```

Only the four primitives and `literal` have `.coerce()`. On `object`, `array`, `union` and `enum` there is no unambiguous target type, so they have none: a field, an item or a member that needs coercion opts into it on its own schema.

| Schema    | `.coerce()` accepts           | Via                                  |
| --------- | ----------------------------- | ------------------------------------ |
| `string`  | anything                      | `String(value)`                      |
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
