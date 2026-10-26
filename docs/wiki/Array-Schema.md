# Array schema

`pvl.array(element)` accepts an array whose every element matches the `element` [Schema](./Concepts.md#schema). It is a composite: the element can itself be an object or an array, at any depth. Its [Constraints](./Concepts.md#constraint) check the array's length.

```ts
const tags = pvl.array(pvl.string().min(1)).max(5);

tags.validate(['a', 'b']); // { value: ['a', 'b'] }
tags.validate(['a', '', 42]); // { issues: [TOO_SMALL at [1], INVALID_TYPE at [2]] }
tags.validate(['a', 'b', 'c', 'd', 'e', 'f']); // { issues: [TOO_BIG 'Array must contain at most 5 element(s)'] }
```

Every element is checked, even after an earlier one failed. The array's own Constraints run only once every element passed.

## At a glance

```mermaid
flowchart LR
    subgraph Interpreted
        direction TB
        I1["ArrayInterpretedSchema<br/>itemSchema: pvl.string().min(1)<br/>post-modifiers: [max 5]"] --> I2["_checkType: an array?<br/>then itemSchema._validate per element"]
        I2 --> I3["post-modifier max:<br/>output.length <= 5?"]
    end
    subgraph Compiled
        direction TB
        C1["one _validate"] --> C2["if (!Array.isArray(value)) push else {<br/>for (index1…) { the element's checks, inlined }"]
        C2 --> C3["if (no new Issue) {<br/>if (output1.length > 5) push } }"]
    end
```

## Interpreted

`ArrayInterpretedSchema` holds the element Schema and exposes it as `element`. `_checkType` checks that the value is an array, then calls the element Schema's own `_validate` on every item, with the index added to the path. Each item runs the element's whole [pipeline](./Interpreted-Pipeline.md).

```mermaid
flowchart TD
    V["_validate(value, path)"] --> PRE["the array's pre-modifiers:<br/>.optional() .nullable()<br/>(.coerce() is the identity)"]
    PRE --> TC{"_checkType:<br/>Array.isArray(value)?"}
    TC -- no --> F["return { issues: [INVALID_TYPE 'Expected array'] }"]
    TC -- yes --> LOOP["for each [index, item]"]
    LOOP --> CHILD["result = itemSchema._validate(item, [...path, index])"]
    CHILD --> CR{"result?"}
    CR -- "{ issues }" --> COL["collect them, go on<br/>with the next item"] --> LOOP
    CR -- "{ value }" --> PUSH["output.push(value)"] --> LOOP
    LOOP -- "every item done" --> ANY{"any item failed?"}
    ANY -- yes --> FI["return { issues }<br/>no post-modifier runs"]
    ANY -- no --> POST["post-modifiers, in chain order,<br/>reading the output:<br/>.min() .max() .length() .refine() .transform()"]
    POST --> RV["{ value } or { issues }"]
```

## Compiled

### What the compiler does

The element is the factory's argument, read through `readNested` into the Schema of its own factory. `ArraySchemaEmitter` writes one loop, with the element's checks inlined in it.

```mermaid
flowchart TD
    R["readSchema: pvl.array(pvl.string().min(1)).max(5)"] --> RFA["ArraySchema.readFactoryArgument:<br/>element → readNested"]
    RFA --> S["ArraySchema<br/>element: StringSchema (calls: [min(1)])<br/>calls: [max(5)]"]
    S --> E["ArraySchemaEmitter"]
    E --> BC["_emitBaseCheck:<br/>!Array.isArray(value)"]
    E --> CP["_emitCompositeParts"]
    CP --> LOC["scope.nextCompositeLocals():<br/>output1, index1, element1, path1, issueCount1"]
    CP --> DEC["declaration: const output1 = []"]
    CP --> LP["childChecks: emitLoop<br/>for (let index1 …) {<br/>element.emitter.emitNestedSchemaChecks at [...path1, index1];<br/>output1.push(element1) }"]
    E --> PMC["_emitPostModifierChecks:<br/>postModifierChecks.max → if (output1.length > 5)"]
    E --> CS["_emitCompiledStructure: element"]
    BC --> FR["Frame.composeChecks"]
    LOC --> FR
    DEC --> FR
    LP --> FR
    PMC --> FR
```

### What the emitted code does

`pvl.compile(pvl.array(pvl.string().min(1)).max(5))` compiles to this `_validate`:

<!-- prettier-ignore -->
```ts
_validate(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
  const issues: PvlIssue[] = [];
  if (!Array.isArray(value)) {
    issues.push({ code: "INVALID_TYPE", message: "Expected array", path: path.length > 0 ? path : undefined });
  } else {
    const path1 = path;
    const issueCount1 = issues.length;
    const output1: unknown[] = [];
    for (let index1 = 0; index1 < value.length; index1++) {
      const element1: unknown = value[index1];
      if (typeof element1 !== "string") {
        issues.push({ code: "INVALID_TYPE", message: "Expected string", path: [...path1, index1] });
      } else {
        if (element1.length < 1) {
          issues.push({ code: "TOO_SMALL", message: "String must contain at least 1 character(s)", path: [...path1, index1] });
        }
      }
      output1.push(element1);
    }
    if (issues.length === issueCount1) {
      if (output1.length > 5) {
        issues.push({ code: "TOO_BIG", message: "Array must contain at most 5 element(s)", path: path.length > 0 ? path : undefined });
      }
    }
    value = output1;
  }
  return issues.length > 0 ? { issues } : { value };
}
```

```mermaid
flowchart TD
    S["issues = []"] --> T{"!Array.isArray(value)?"}
    T -- yes --> P1["push INVALID_TYPE"] --> RET
    T -- "no (else)" --> L["path1 = path; issueCount1 = issues.length;<br/>output1 = []"]
    L --> FOR{"index1 < value.length?"}
    FOR -- yes --> EL{"element1 = value[index1]:<br/>not a string?"}
    EL -- yes --> PE["push INVALID_TYPE at [...path1, index1]"] --> PUSH
    EL -- no --> MIN{"element1.length < 1?"}
    MIN -- yes --> PM["push TOO_SMALL at [...path1, index1]"] --> PUSH
    MIN -- no --> PUSH["output1.push(element1); index1++"]
    PUSH --> FOR
    FOR -- no --> G{"issues.length === issueCount1?<br/>every element passed"}
    G -- yes --> MAX{"output1.length > 5?"}
    MAX -- yes --> PX["push TOO_BIG"] --> H
    MAX -- no --> H
    G -- no --> H["value = output1"]
    H --> RET["return { issues } or { value }"]
```

An element that is itself an object or an array is inlined in the loop the same way, with its own numbered locals, and its value declared with `let`.

## The `element` property

Interpreted and compiled, an array exposes its element Schema as `element`. Unlike an object's `shape`, every array has it, marked or not; marking the element `.standalone()` only decides whether the compiled one is compiled too.

```mermaid
flowchart TD
    Q{"element marked .standalone()?"}
    Q -- yes --> M["_emitCompiledStructure: a Compiled Schema<br/>of its own, built in the constructor<br/>into this.element"]
    Q -- no --> U["no code emitted for it: the source<br/>pvl.string().min(1) is passed in where<br/>pvl.compile(...) was, as the element field"]
```

So the unmarked element above is passed to the class as is, which makes the root a generic arrow function, typed by the element it is handed:

<!-- prettier-ignore -->
```ts
export const tags = (<TElement0,>(element: TElement0): PvlSchema<string[], string[]> & { readonly element: TElement0 } => new (class PvlCompiledSchema0 implements PvlSchema<string[], string[]> {
  declare readonly [PVL_SCHEMA_BRAND]: true;
  readonly _standalone: boolean = false;

  constructor(readonly element: TElement0) {}
  …
})(element))(pvl.string().min(1));
```

The array's own `_validate` never calls `element`: its checks are inlined in the loop. A transformed array has no `element`.

## Local Modifiers

| Method                     | Issue code       | Default message                            | Interpreted passes when | Compiled fails when    |
| -------------------------- | ---------------- | ------------------------------------------ | ----------------------- | ---------------------- |
| `.min(n, { message }?)`    | `TOO_SMALL`      | `Array must contain at least n element(s)` | `value.length >= n`     | `output1.length < n`   |
| `.max(n, { message }?)`    | `TOO_BIG`        | `Array must contain at most n element(s)`  | `value.length <= n`     | `output1.length > n`   |
| `.length(n, { message }?)` | `INVALID_LENGTH` | `Array must contain exactly n element(s)`  | `value.length === n`    | `output1.length !== n` |

## Source

- [`arrayInterpretedSchema.ts`](../../packages/schema/src/schemas/arrayInterpretedSchema.ts): `ArrayInterpretedSchema`, `ARRAY_SCHEMA_ISSUE_MESSAGE`
- [`schemas/arraySchema.ts`](../../packages/schema-compiler/src/schemas/arraySchema.ts): `ArraySchema`
- [`emitters/arraySchemaEmitter.ts`](../../packages/schema-compiler/src/emitters/arraySchemaEmitter.ts): `ArraySchemaEmitter`, `emitLoop`

Further reading: [schema-types.md](../specification/schema/schema-types.md), [code-generation.md](../specification/schema-compiler/code-generation.md#a-compiled-schema-exposes-its-standalone-keys), [ADR-0012](../adr/0012-composite-schemas-collect-every-issue.md), [ADR-0036](../adr/0036-standalone-keys-are-reinstated-and-shape-and-element-survive-every-call-but-transform.md).
