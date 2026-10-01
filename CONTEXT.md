# pvl

A TypeScript validation stack: a Zod-style schema library, and a compiler that turns those schemas into plain, dependency-free validation code ahead of time.

## Language

### Validation library

**Schema**:
A declarative description of the shape and constraints a value must satisfy.
_Avoid_: Type, Model.

**Issue**:
A single reported failure produced when a value doesn't satisfy a Schema.
_Avoid_: Error, Violation.

**Result**:
The outcome of validating a value against a Schema: either the accepted value (possibly transformed) or the list of Issues that failed it. The term is the name of the type `@pvl/schema`'s validation call returns, and the one used by the [Standard Schema](./docs/specification/standard-schema.md) specification the package conforms to.
_Avoid_: Validation Result, Parse Result.

**Modifier**:
Any chainable method on a Schema that returns a Schema, as opposed to one that validates or reads it. The umbrella term over Shared Modifier and Local Modifier; every Modifier is one or the other. See [ADR-0006](./docs/adr/0006-chained-instance-method-api-via-shared-base-schema-class.md).
_Avoid_: Combinator, wrapper.

**Shared Modifier**:
A Modifier available on _every_ Schema — `.optional()`, `.nullable()`, `.coerce()`, `.refine()`, `.transform()` — recorded in the single `SharedModifiers` record the base `Schema` class owns. See [ADR-0010](./docs/adr/0010-schema-modifier-ordered-step-list.md) for the order they are evaluated in.
_Avoid_: Common modifier, base modifier, global modifier.

**Local Modifier**:
A Modifier offered by a _single_ Schema class and stored as that class's own property: `.min()`/`.max()`/`.length()`/`.int()` on `string`, `number`, `bigint` and `array`, and `.strict()`/`.passthrough()` on `object`. The axis that separates it from a Shared Modifier is reach, not importance. See [ADR-0006](./docs/adr/0006-chained-instance-method-api-via-shared-base-schema-class.md), whose amendments cover how a Local Modifier clones through the base class so the Shared Modifiers survive it.
_Avoid_: Specific modifier, per-type modifier.

**Constraint**:
A value-checking Local Modifier — one that narrows which values a Schema accepts, such as `.min()` or `.int()`. Every Constraint is a Local Modifier, but not every Local Modifier is a Constraint: `object`'s `.strict()`/`.passthrough()` change how unknown keys are treated rather than checking a value. See [ADR-0008](./docs/adr/0008-no-regex-backed-constraints-in-v1.md). It is a glossary term only; no `Constraint` type exists — each Schema class names its own check type (`StringCheck`, `NumberCheck`) privately.
_Avoid_: Rule, validator, assertion.

**Refinement**:
An extra, user-supplied predicate attached to a Schema that a value must satisfy in addition to the Schema's base shape. A Refinement only accepts or rejects a value — it never changes it (contrast Transform). It is attached by `.refine()`, a Shared Modifier.
_Avoid_: Custom validator, constraint.

**Coercion**:
An explicit, opt-in conversion of an input value to a Schema's target type _before_ that value is checked against the Schema (e.g. the string `"5"` becomes the number `5`, which is then validated as a number). It is opted into by `.coerce()`, a Shared Modifier.
_Avoid_: Cast, Transform.

**Transform**:
A user-supplied function that converts a Schema's accepted value into a different Output value as part of producing the Result — unlike Coercion, which runs before validation, a Transform runs as validation succeeds, and unlike a Refinement, it changes the value rather than only accepting or rejecting it. It is attached by `.transform()`, a Shared Modifier.
_Avoid_: Mapper, Coercion.

### AOT compiler

**AOT Compilation**:
Turning a Schema into a Compiled Schema before the program runs, as opposed to validating by walking the Schema tree at request time.
_Avoid_: JIT, runtime compilation.

**Compiled Schema**:
The artifact `@pvl/schema-compiler` produces for a Schema marked with `pvl.compile(...)`: a [Standard Schema](./docs/specification/standard-schema.md)-conformant object — `~standard`, `validate`, `shape`, `element` — backed by emitted Instructions rather than by the Schema tree. It is terminal, so no modifier attaches to it ([ADR-0016](./docs/adr/0016-compiled-schemas-are-terminal.md)). It reports the same `vendor` as an interpreted Schema, which is what lets it sit as a field of an interpreted composite — composites accept any Standard Schema this library produced, and no other library's ([ADR-0018](./docs/adr/0018-composites-accept-pvl-standard-schema-fields.md)).
_Avoid_: Compiled Validator, Runtime validator.

**Instruction**:
One primitive operation — a conditional check, a loop, a direct property read or assignment — the compiler emits as literal inline JavaScript in the Destination File. An Instruction is generated source text, never a data structure an interpreter later walks.
_Avoid_: Opcode.

**Destination File**:
The single aggregate module `@pvl/schema-compiler` writes, mirroring every export of every scanned file — marked Schemas as Compiled Schemas, everything else copied through unchanged. See [ADR-0005](./docs/adr/0005-compiler-emits-a-destination-file-and-rewrites-nothing.md) for why it exists and [ADR-0015](./docs/adr/0015-compiled-schema-destination-resolution.md) for where it lands.
_Avoid_: Generated file, output bundle, artifact directory.

**Standalone Key**:
A key of a compiled `pvl.object(...)` marked `.standalone()` — the only kind of key a Compiled Schema's `shape` carries, at both type and runtime. `.standalone()` is a no-op on an uncompiled Schema.
_Avoid_: Exported key, public key.
