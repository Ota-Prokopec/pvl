# Literal schema

`pvl.literal(value)` accepts exactly one value: a `string`, `number`, `boolean` or `bigint`.

```ts
const owner = pvl.literal('OWNER');

owner.validate('OWNER'); // { value: 'OWNER' }
owner.validate('ADMIN'); // { issues: [{ code: 'INVALID_VALUE', message: 'Expected "OWNER"' }] }
```

The comparison is `Object.is`, not `===`. They differ on two values only: `pvl.literal(0)` rejects `-0`, and `pvl.literal(NaN)` accepts `NaN`. A right-looking value of the wrong type (`'42'` for `pvl.literal(42)`) is rejected like any wrong value, unless [`.coerce()`](./Coerce.md) converts it first.

## At a glance

```mermaid
flowchart LR
    subgraph Interpreted
        direction TB
        I1["LiteralInterpretedSchema<br/>literalValue: 'OWNER'"] --> I2["_checkType:<br/>!Object.is(value, this.literalValue)?"]
    end
    subgraph Compiled
        direction TB
        C1["one _validate"] --> C2["if (!Object.is(value, 'OWNER')) push<br/>the value is written into the code"]
    end
```

## Interpreted

`LiteralInterpretedSchema` keeps the value it was built with and runs the [interpreted pipeline](./Interpreted-Pipeline.md). Its own parts:

- **`_checkType`**: `!Object.is(value, this.literalValue)` reports `INVALID_VALUE`, with the message `Expected <the value>` (`Expected "OWNER"`, `Expected 42`).
- **`_coerceInput`**: picks the conversion of its value's primitive, by `typeof this.literalValue`: `pvl.literal(42).coerce()` converts as `pvl.number().coerce()` does, then compares.

```mermaid
flowchart TD
    V["_validate(value, path)"] --> PRE["pre-modifiers:<br/>.optional() .nullable() .coerce()"]
    PRE --> CO{".coerce() chained?"}
    CO -- yes --> PICK["_coerceInput: by typeof literalValue<br/>string → coerceToString<br/>number → coerceToNumber<br/>boolean → coerceToBoolean<br/>bigint → coerceToBigint"]
    CO -- no --> TC
    PICK --> TC{"_checkType:<br/>Object.is(value, literalValue)?"}
    TC -- no --> F["return { issues: [INVALID_VALUE 'Expected #quot;OWNER#quot;'] }"]
    TC -- yes --> POST["post-modifiers: .refine(), .transform()"]
    POST --> RV["{ value } or { issues }"]
```

## Compiled

### What the compiler does

The literal is the factory's argument, so it must be read statically: a literal written in place, or a top-level `const` of the same file holding one. `LiteralSchema.readFactoryArgument` reads it into `LiteralSchema.value`, and `LiteralSchemaEmitter` writes it back into the code as a literal. Anything else (an import, a parameter, a call) is `COMPILE_ARGUMENT_UNRESOLVABLE`.

```mermaid
flowchart TD
    R["readSchema: pvl.literal('OWNER')"] --> RFA["LiteralSchema.readFactoryArgument<br/>GenericAst.readLiteral → 'OWNER'"]
    RFA --> S["LiteralSchema<br/>value: 'OWNER'"]
    S --> E["LiteralSchemaEmitter"]
    E --> BC["_emitBaseCheck:<br/>!Object.is(value, #quot;OWNER#quot;), code INVALID_VALUE,<br/>message LITERAL_SCHEMA_ISSUE_MESSAGE._checkType('OWNER')"]
    E --> CO["_emitCoercion (only with .coerce()):<br/>by typeof schema.value, the matching<br/>emitCoerceTo… of the primitive"]
    E --> TY["_spellFactoryTypes:<br/>Input and Output are the literal type #quot;OWNER#quot;"]
    BC --> FR["Frame.composeChecks"]
    CO --> FR
```

### What the emitted code does

`pvl.compile(pvl.literal('OWNER'))` compiles to:

<!-- prettier-ignore -->
```ts
_validate(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
  const issues: PvlIssue[] = [];
  if (!Object.is(value, "OWNER")) {
    issues.push({ code: "INVALID_VALUE", message: "Expected \"OWNER\"", path: path.length > 0 ? path : undefined });
  }
  return issues.length > 0 ? { issues } : { value };
}
```

```mermaid
flowchart TD
    S["issues = []"] --> T{"!Object.is(value, 'OWNER')?"}
    T -- yes --> P1["push INVALID_VALUE"] --> RET
    T -- no --> RET["return { issues } or { value }"]
```

The interpreted Schema reads its value off the instance on every call; the compiled one has it written into the comparison.

## Local Modifiers

None.

## Source

- [`literalInterpretedSchema.ts`](../../packages/schema/src/schemas/literalInterpretedSchema.ts): `LiteralInterpretedSchema`, `LITERAL_SCHEMA_ISSUE_MESSAGE`
- [`schemas/literalSchema.ts`](../../packages/schema-compiler/src/schemas/literalSchema.ts): `LiteralSchema`
- [`emitters/literalSchemaEmitter.ts`](../../packages/schema-compiler/src/emitters/literalSchemaEmitter.ts): `LiteralSchemaEmitter`

Further reading: [schema-types.md](../specification/schema/schema-types.md), [compilation.md](../specification/schema-compiler/compilation.md#what-reads-statically).
