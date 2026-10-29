# Object schema

`pvl.object(shape)` accepts a plain object whose fields match the [Schemas](./Concepts.md#schema) in `shape`. It is a composite: it holds other Schemas, at any depth.

```ts
const user = pvl.object({
  email: pvl.string().standalone(),
  age: pvl.number().optional(),
});

user.validate({ email: 'ada@example.com', role: 'x' }); // { value: { email: 'ada@example.com' } }: role stripped
user.strict().validate({ email: 'a@b.c', role: 'x' }); // { issues: [UNRECOGNIZED_KEY at ['role']] }
user.validate({ email: 42, age: 'old' }); // { issues: [INVALID_TYPE at ['email'], INVALID_TYPE at ['age']] }
```

- Every field is checked, even after an earlier one failed, so every problem is reported at once.
- A key the shape doesn't declare is **stripped** from the output by default. `.strict()` reports it instead, and `.passthrough()` keeps it.
- An `.optional()` field's key may be left out, and stays left out of the output rather than becoming `key: undefined`.
- An array or `null` isn't an object here.

## At a glance

```mermaid
flowchart LR
    subgraph Interpreted
        direction TB
        I1["ObjectInterpretedSchema<br/>_shape: { email, age }<br/>post-modifiers: [strict]"] --> I2["_checkType: an object?<br/>then each field's own _validate"]
        I2 --> I3["post-modifier strict:<br/>report undeclared keys"]
    end
    subgraph Compiled
        direction TB
        C1["one _validate"] --> C2["if (not an object) push else {<br/>email's checks, inlined<br/>age's checks, inlined"]
        C2 --> C3["build output1;<br/>if (no new Issue) loop over keys }"]
    end
```

## Interpreted

### Building it

The constructor does the per-shape work once, not on every validation:

```mermaid
flowchart TD
    NEW["new ObjectInterpretedSchema(shape)"] --> K["_shapeKeys = new Set(Object.keys(shape))"]
    NEW --> C["_shape = { ...shape }"]
    NEW --> SS["_standaloneShape = the fields<br/>whose _standalone flag is set"]
    K --> STRIP["super({ postModifiers:<br/>[unknownKeysStripModifier(_shapeKeys)] })<br/>stripping is the default first post-modifier"]
    STRIP --> STR[".strict(): _withoutModifiers(UNKNOWN_KEYS_MODIFIERS)<br/>then append unknownKeysStrictModifier"]
    STRIP --> PT[".passthrough(): _withoutModifiers(UNKNOWN_KEYS_MODIFIERS)<br/>and nothing else"]
```

Stripping, `.strict()` and `.passthrough()` each remove the other's step, found by the factory that built it, so the last one chained wins.

### Running it

`_checkType` checks that the value is an object, then calls every field's own `_validate` with the field's key added to the path. Each field runs its whole [pipeline](./Interpreted-Pipeline.md) there: its pre-modifiers, its type check, its post-modifiers.

```mermaid
flowchart TD
    V["_validate(value, path)"] --> PRE["the object's pre-modifiers:<br/>.optional() .nullable()"]
    PRE --> TC{"_checkType: typeof value === 'object',<br/>not null, not an array?"}
    TC -- no --> F["return { issues: [INVALID_TYPE 'Expected object'] }"]
    TC -- yes --> LOOP["for each [key, fieldSchema] of _shape"]
    LOOP --> CHILD["result = fieldSchema._validate(input[key], [...path, key])"]
    CHILD --> CR{"result?"}
    CR -- "{ issues }" --> COL["collect them, go on<br/>with the next field"]
    CR -- "{ value: undefined } and<br/>the key isn't in the input" --> SKIP["leave the key out"]
    CR -- "{ value }" --> SET["output[key] = value"]
    COL --> LOOP
    SKIP --> LOOP
    SET --> LOOP
    LOOP -- "every field done" --> ANY{"any field failed?"}
    ANY -- yes --> FI["return { issues }<br/>no post-modifier runs"]
    ANY -- no --> UNK["copy every undeclared key<br/>onto the output too"]
    UNK --> POST["post-modifiers, in chain order"]
    POST --> UK{"unknown-keys step?"}
    UK -- "strip (default)" --> SKP["{ value: a copy with<br/>only the declared keys }"]
    UK -- ".strict()" --> SRT["an UNRECOGNIZED_KEY Issue per<br/>undeclared key, at [...path, key]"]
    UK -- ".passthrough()" --> NONE["no step: the undeclared keys stay"]
    SKP --> REST[".refine(), .transform(),<br/>reading the output"]
    SRT --> REST
    NONE --> REST
```

## Compiled

### What the compiler does

`pvl.object(shape)`'s shape is the factory's argument, so it must be an object literal written in place, or a top-level `const` of the same file holding one. `ObjectSchema.readFactoryArgument` reads each field through `readNested`, recursively, into the Schema of its own factory.

```mermaid
flowchart TD
    R["readSchema: pvl.object({ email: …, age: … }).strict()"] --> RFA["ObjectSchema.readFactoryArgument:<br/>each property → readNested"]
    RFA --> S["ObjectSchema<br/>shape: [email: StringSchema (isStandalone),<br/>age: NumberSchema (calls: [optional])]<br/>calls: [strict]"]
    S --> E["ObjectSchemaEmitter"]
    E --> BC["_emitBaseCheck:<br/>typeof value !== 'object' || value === null || Array.isArray(value)"]
    E --> CP["_emitCompositeParts"]
    CP --> LOC["scope.nextCompositeLocals():<br/>input1, output1, path1, issueCount1"]
    CP --> DEC["declaration: const input1 = value"]
    CP --> FC["childChecks: per field,<br/>fieldSchema.emitter.emitNestedSchemaChecks<br/>reading input1['email'] at [...path1, 'email']"]
    CP --> OS["outputStatements: const output1 = {};<br/>output1['email'] = field0; …<br/>with .passthrough(): copy undeclared keys"]
    E --> PMC["_emitPostModifierChecks:<br/>keyChecks.strict (only the last unknown-keys call),<br/>.refine() from postModifierChecks"]
    E --> CS["_emitCompiledStructure:<br/>shape, with a Compiled Schema per Standalone Key"]
    BC --> FR["Frame.composeChecks"]
    LOC --> FR
    DEC --> FR
    FC --> FR
    OS --> FR
    PMC --> FR
```

There is no stripping step: the compiled output object is built from the declared fields only, so undeclared keys are never on it unless `.passthrough()` copies them.

### What the emitted code does

`pvl.compile(pvl.object({ email: pvl.string().standalone(), age: pvl.number().optional() }).strict())` compiles to this `_validate`:

<!-- prettier-ignore -->
```ts
_validate(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
  const issues: PvlIssue[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push({ code: "INVALID_TYPE", message: "Expected object", path: path.length > 0 ? path : undefined });
  } else {
    const path1 = path;
    const issueCount1 = issues.length;
    const input1 = value as Record<string, unknown>;

    // email
    const field0 = input1["email"];
    if (typeof field0 !== "string") {
      issues.push({ code: "INVALID_TYPE", message: "Expected string", path: [...path1, "email"] });
    }

    // age
    const field1 = input1["age"];
    if (!((field1 === undefined))) {
      if (typeof field1 !== "number" || Number.isNaN(field1)) {
        issues.push({ code: "INVALID_TYPE", message: "Expected number", path: [...path1, "age"] });
      }
    }

    const output1: Record<string, unknown> = {};
    output1["email"] = field0;
    if (field1 !== undefined || Object.hasOwn(input1, "age")) {
      output1["age"] = field1;
    }
    if (issues.length === issueCount1) {
      for (const key of Object.keys(input1)) {
        if (key !== "email" && key !== "age") {
          issues.push({ code: "UNRECOGNIZED_KEY", message: `Unrecognized key "${key}"`, path: [...path1, key] });
        }
      }
    }
    value = output1;
  }
  return issues.length > 0 ? { issues } : { value };
}
```

```mermaid
flowchart TD
    S["issues = []"] --> T{"not an object?"}
    T -- yes --> P1["push INVALID_TYPE"] --> RET
    T -- "no (else)" --> L["path1 = path; issueCount1 = issues.length;<br/>input1 = value"]
    L --> E1{"field0 = input1.email:<br/>not a string?"}
    E1 -- yes --> PE["push INVALID_TYPE at [...path1, 'email']"] --> A1
    E1 -- no --> A1{"field1 = input1.age:<br/>=== undefined?"}
    A1 -- "yes: skip its checks" --> OUT
    A1 -- no --> A2{"not a number, or NaN?"}
    A2 -- yes --> PA["push INVALID_TYPE at [...path1, 'age']"] --> OUT
    A2 -- no --> OUT["output1 = { email: field0 };<br/>age only if defined or present"]
    OUT --> G{"issues.length === issueCount1?<br/>every field passed"}
    G -- yes --> STR["for each key of input1 not declared:<br/>push UNRECOGNIZED_KEY at [...path1, key]"]
    G -- no --> H
    STR --> H["value = output1"]
    H --> RET["return { issues } or { value }"]
```

A nested object or array field is inlined the same way, one level deeper, with its own numbered locals (`path2`, `input2`, `output2`); its value is declared with `let`, as its checks replace it with the output they built. [Compiled schema runtime](./Compiled-Schema-Runtime.md#nested-schemas) shows one.

## Undeclared keys

|                  | Interpreted                                                     | Compiled                                                                 |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| default (strip)  | `_checkType` keeps them, a strip post-modifier copies them away | the output is built from the declared fields only                        |
| `.strict()`      | a post-modifier reports each one, once every field passed       | a loop over `Object.keys(input1)` behind `issues.length === issueCount1` |
| `.passthrough()` | no step: `_checkType`'s output keeps them                       | an output statement copies each one onto `output1`                       |

A `.refine()` on a `.strict()` object sees the undeclared keys too, interpreted and compiled, so the compiled object copies them onto its output in that case as well.

## Standalone Keys

A field marked `.standalone()` is a [Standalone Key](./Concepts.md#standalone-key): it is in the object's `shape`, so it can be validated on its own (`user.shape.email.validate(…)`). Only Standalone Keys are in `shape`. Marking a field changes no check.

```mermaid
flowchart LR
    subgraph Interpreted
        direction TB
        I1["constructor: _standaloneShape =<br/>every field with _standalone set"] --> I2["get shape() returns it:<br/>the same field Schemas"]
    end
    subgraph Compiled
        direction TB
        C1["_emitCompiledStructure: per Standalone Key,<br/>emitStandaloneCompiledSchema"] --> C2["a class of its own, PvlCompiledSchema0_0,<br/>built once in the constructor into this.shape"]
    end
```

The compiled `user` above has, besides its `_validate`:

<!-- prettier-ignore -->
```ts
readonly shape: { readonly email: PvlSchema<string, string> & PvlStandaloneMarker };

constructor() {
  this.shape = {
    "email": (new (class PvlCompiledSchema0_0 implements PvlSchema<string, string> {
      declare readonly [PVL_SCHEMA_BRAND]: true;
      declare readonly [PVL_STANDALONE_BRAND]: true;
      readonly _standalone: boolean = true;
      …
    })() as PvlSchema<string, string> & PvlStandaloneMarker),
  };
}
```

The parent's own `_validate` still inlines the field's checks: it never calls `shape.email`. An object with no Standalone Key gets `readonly shape: {} = {};`, and a transformed object has no `shape` at all.

## Local Modifiers

| Method                  | Issue code         | Default message            | What it does                                     |
| ----------------------- | ------------------ | -------------------------- | ------------------------------------------------ |
| `.strict({ message }?)` | `UNRECOGNIZED_KEY` | `Unrecognized key "<key>"` | Reports each undeclared key, at `[...path, key]` |
| `.passthrough()`        | none               | none                       | Keeps undeclared keys on the output              |

## Source

- [`objectInterpretedSchema.ts`](../../packages/schema/src/schemas/objectInterpretedSchema.ts): `ObjectInterpretedSchema`, the unknown-key modifiers, `OBJECT_SCHEMA_ISSUE_MESSAGE`
- [`schemas/objectSchema.ts`](../../packages/compiler/src/schemas/objectSchema.ts): `ObjectSchema`
- [`emitters/objectSchemaEmitter.ts`](../../packages/compiler/src/emitters/objectSchemaEmitter.ts): `ObjectSchemaEmitter`
- [`emitters/frame.ts`](../../packages/compiler/src/emitters/frame.ts): `composeCompositeStatements`

Further reading: [schema-types.md](../specification/schema/schema-types.md), [standalone-keys.md](../specification/standalone-keys.md), [ADR-0007](../adr/0007-object-strips-unknown-keys-by-default.md), [ADR-0012](../adr/0012-composite-schemas-collect-every-issue.md), [ADR-0036](../adr/0036-standalone-keys-are-reinstated-and-shape-and-element-survive-every-call-but-transform.md).
