# Boolean schema

`pvl.boolean()` accepts `true` and `false`. It has no [Constraints](./Concepts.md#constraint), only the [Shared Modifiers](./Concepts.md#shared-modifier-and-local-modifier).

```ts
const accepted = pvl.boolean();

accepted.validate(true); // { value: true }
accepted.validate('true'); // { issues: [{ code: 'INVALID_TYPE', message: 'Expected boolean' }] }
```

## At a glance

```mermaid
flowchart LR
    subgraph Interpreted
        direction TB
        I1["BooleanInterpretedSchema<br/>no Local Modifier"] --> I2["_checkType:<br/>typeof value !== 'boolean'?"]
    end
    subgraph Compiled
        direction TB
        C1["one _validate"] --> C2["if (typeof value !== 'boolean') push"]
    end
```

## Interpreted

`BooleanInterpretedSchema` runs the [interpreted pipeline](./Interpreted-Pipeline.md). Its own parts:

- **`_checkType`**: `typeof value !== 'boolean'` reports `INVALID_TYPE`, `"Expected boolean"`.
- **`_coerceInput`**: `coerceToBoolean`, for [`.coerce()`](./Coerce.md): a `string`, `number` or `bigint` becomes `Boolean(value)`. That is JavaScript truthiness, so every non-empty string, `'false'` included, becomes `true`.

```mermaid
flowchart TD
    V["_validate(value, path)"] --> PRE["pre-modifiers:<br/>.optional() .nullable() .coerce()"]
    PRE --> TC{"_checkType:<br/>typeof value === 'boolean'?"}
    TC -- no --> F["return { issues: [INVALID_TYPE 'Expected boolean'] }"]
    TC -- yes --> POST["post-modifiers: .refine(), .transform()"]
    POST --> END{"any Issue?"}
    END -- yes --> RI["{ issues }"]
    END -- no --> RV["{ value }"]
```

## Compiled

### What the compiler does

`readSchema` reads `pvl.boolean()` into a `BooleanSchema`. `BooleanSchemaEmitter` has no `postModifierChecks` of its own, only the ones it inherits (`.refine()`).

```mermaid
flowchart TD
    R["readSchema: pvl.boolean()"] --> S["BooleanSchema<br/>calls: []"]
    S --> E["BooleanSchemaEmitter"]
    E --> BC["_emitBaseCheck:<br/>typeof value !== 'boolean'"]
    E --> CO["_emitCoercion (only with .coerce()):<br/>for a string, number or bigint:<br/>value = Boolean(value);"]
    BC --> FR["Frame.composeChecks"]
    CO --> FR
```

### What the emitted code does

`pvl.compile(pvl.boolean())` compiles to:

<!-- prettier-ignore -->
```ts
_validate(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
  const issues: PvlIssue[] = [];
  if (typeof value !== "boolean") {
    issues.push({ code: "INVALID_TYPE", message: "Expected boolean", path: path.length > 0 ? path : undefined });
  }
  return issues.length > 0 ? { issues } : { value };
}
```

With no post-modifier, the base check has no `else`.

```mermaid
flowchart TD
    S["issues = []"] --> T{"typeof value !== 'boolean'?"}
    T -- yes --> P1["push INVALID_TYPE"] --> RET
    T -- no --> RET["return { issues } or { value }"]
```

## Local Modifiers

None.

## Source

- [`booleanInterpretedSchema.ts`](../../packages/schema/src/schemas/booleanInterpretedSchema.ts): `BooleanInterpretedSchema`, `BOOLEAN_SCHEMA_ISSUE_MESSAGE`
- [`schemas/booleanSchema.ts`](../../packages/schema-compiler/src/schemas/booleanSchema.ts): `BooleanSchema`
- [`emitters/booleanSchemaEmitter.ts`](../../packages/schema-compiler/src/emitters/booleanSchemaEmitter.ts): `BooleanSchemaEmitter`

Further reading: [schema-types.md](../specification/schema/schema-types.md).
