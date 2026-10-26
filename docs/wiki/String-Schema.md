# String schema

`pvl.string()` accepts any `string`. Its [Constraints](./Concepts.md#constraint) check the length.

```ts
const username = pvl.string().min(3).max(20);

username.validate('ada_l'); // { value: 'ada_l' }
username.validate('al'); // { issues: [{ code: 'TOO_SMALL', message: 'String must contain at least 3 character(s)' }] }
username.validate(42); // { issues: [{ code: 'INVALID_TYPE', message: 'Expected string' }] }
```

## At a glance

```mermaid
flowchart LR
    subgraph Interpreted
        direction TB
        I1["StringInterpretedSchema<br/>post-modifiers: [min 3, max 20]"] --> I2["_checkType:<br/>typeof value !== 'string'?"]
        I2 --> I3["run fn of min, then fn of max"]
    end
    subgraph Compiled
        direction TB
        C1["one _validate"] --> C2["if (typeof value !== 'string') push<br/>else {"]
        C2 --> C3["if (value.length < 3) push<br/>if (value.length > 20) push }"]
    end
```

## Interpreted

`StringInterpretedSchema` runs the [interpreted pipeline](./Interpreted-Pipeline.md). Its own parts:

- **`_checkType`**: `typeof value !== 'string'` reports `INVALID_TYPE`, `"Expected string"`; anything else passes as it is.
- **`.min()`, `.max()`, `.length()`**: each appends a [post-modifier](./Concepts.md#pre-modifier-and-post-modifier) comparing `value.length`, so they run in chain order once the type check passed, and every failing one is reported.
- **`_coerceInput`**: `coerceToString`, for [`.coerce()`](./Coerce.md).

```mermaid
flowchart TD
    V["_validate(value, path)"] --> PRE["pre-modifiers:<br/>.optional() .nullable() .coerce()"]
    PRE --> TC{"_checkType:<br/>typeof value === 'string'?"}
    TC -- no --> F["return { issues: [INVALID_TYPE 'Expected string'] }"]
    TC -- yes --> MIN{"post-modifier .min(3):<br/>value.length >= 3?"}
    MIN -- no --> MINI["collect TOO_SMALL"] --> MAX
    MIN -- yes --> MAX{"post-modifier .max(20):<br/>value.length <= 20?"}
    MAX -- no --> MAXI["collect TOO_BIG"] --> END
    MAX -- yes --> END{"any Issue?"}
    END -- yes --> RI["{ issues }"]
    END -- no --> RV["{ value }"]
```

## Compiled

### What the compiler does

`pvl.string()` takes no argument, so `readSchema` reads it into a `StringSchema` holding only its chained calls. `StringSchemaEmitter` writes its parts; [Compiled schema runtime](./Compiled-Schema-Runtime.md) shows how they are put together.

```mermaid
flowchart TD
    R["readSchema: pvl.string().min(3).max(20)"] --> S["StringSchema<br/>calls: [min(3), max(20)]"]
    S --> E["StringSchemaEmitter"]
    E --> BC["_emitBaseCheck:<br/>emitTypeCheck({ failsWhen: typeof value !== 'string',<br/>message: STRING_SCHEMA_ISSUE_MESSAGE._checkType() })"]
    E --> PMC["_emitPostModifierChecks:<br/>postModifierChecks.min → if (value.length < 3)<br/>postModifierChecks.max → if (value.length > 20)"]
    E --> CO["_emitCoercion (only with .coerce()):<br/>value = String(value);"]
    BC --> FR["Frame.composeChecks"]
    PMC --> FR
    CO --> FR
```

Each Constraint's message is computed while compiling with the same `STRING_SCHEMA_ISSUE_MESSAGE` function the interpreted Schema calls, and written in as text. With a [Runtime Argument](./Concepts.md#runtime-argument) (`.max(maxLength)`), the message is built once in the constructor instead, from `argumentMessages`.

### What the emitted code does

`pvl.compile(pvl.string().min(3).max(20))` compiles to this `_validate` (the whole class is on [Compiled schema runtime](./Compiled-Schema-Runtime.md#the-class)):

<!-- prettier-ignore -->
```ts
_validate(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
  const issues: PvlIssue[] = [];
  if (typeof value !== "string") {
    issues.push({ code: "INVALID_TYPE", message: "Expected string", path: path.length > 0 ? path : undefined });
  } else {
    if (value.length < 3) {
      issues.push({ code: "TOO_SMALL", message: "String must contain at least 3 character(s)", path: path.length > 0 ? path : undefined });
    }
    if (value.length > 20) {
      issues.push({ code: "TOO_BIG", message: "String must contain at most 20 character(s)", path: path.length > 0 ? path : undefined });
    }
  }
  return issues.length > 0 ? { issues } : { value };
}
```

```mermaid
flowchart TD
    S["issues = []"] --> T{"typeof value !== 'string'?"}
    T -- yes --> P1["push INVALID_TYPE"]
    T -- "no (else)" --> A{"value.length < 3?"}
    A -- yes --> P2["push TOO_SMALL"] --> B
    A -- no --> B{"value.length > 20?"}
    B -- yes --> P3["push TOO_BIG"] --> RET
    B -- no --> RET
    P1 --> RET["return { issues } or { value }"]
```

## Local Modifiers

| Method                     | Issue code       | Default message                               | Interpreted passes when | Compiled fails when  |
| -------------------------- | ---------------- | --------------------------------------------- | ----------------------- | -------------------- |
| `.min(n, { message }?)`    | `TOO_SMALL`      | `String must contain at least n character(s)` | `value.length >= n`     | `value.length < n`   |
| `.max(n, { message }?)`    | `TOO_BIG`        | `String must contain at most n character(s)`  | `value.length <= n`     | `value.length > n`   |
| `.length(n, { message }?)` | `INVALID_LENGTH` | `String must contain exactly n character(s)`  | `value.length === n`    | `value.length !== n` |

There are no regex-based checks (`.email()`, `.regex()`), to keep every built-in check fast: attach your own with [`.refine()`](./Refine.md).

## Source

- [`stringInterpretedSchema.ts`](../../packages/schema/src/schemas/stringInterpretedSchema.ts): `StringInterpretedSchema`, `STRING_SCHEMA_ISSUE_MESSAGE`
- [`schemas/stringSchema.ts`](../../packages/schema-compiler/src/schemas/stringSchema.ts): `StringSchema`
- [`emitters/stringSchemaEmitter.ts`](../../packages/schema-compiler/src/emitters/stringSchemaEmitter.ts): `StringSchemaEmitter`

Further reading: [schema-types.md](../specification/schema/schema-types.md), [ADR-0008](../adr/0008-no-regex-backed-constraints-in-v1.md).
