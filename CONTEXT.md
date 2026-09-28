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

**Refinement**:
An extra, user-supplied predicate attached to a Schema that a value must satisfy in addition to the Schema's base shape. A Refinement only accepts or rejects a value — it never changes it (contrast Transform).
_Avoid_: Custom validator, constraint.

**Coercion**:
An explicit, opt-in conversion of an input value to a Schema's target type _before_ that value is checked against the Schema (e.g. the string `"5"` becomes the number `5`, which is then validated as a number).
_Avoid_: Cast, Transform.

**Transform**:
A user-supplied function that converts a Schema's accepted value into a different Output value as part of producing the Result — unlike Coercion, which runs before validation, a Transform runs as validation succeeds, and unlike a Refinement, it changes the value rather than only accepting or rejecting it.
_Avoid_: Mapper, Coercion.

### AOT compiler

**AOT Compilation**:
Turning a Schema into a Compiled Schema before the program runs, as opposed to validating by walking the Schema tree at request time.
_Avoid_: JIT, runtime compilation.

**Compiled Schema**:
The artifact `@pvl/schema-compiler` produces for a Schema marked with `pvl.compile(...)`: a [Standard Schema](./docs/specification/standard-schema.md)-conformant object — `~standard`, `validate`, `shape`, `element` — backed by emitted Instructions rather than by the Schema tree. It is terminal, so no modifier attaches to it ([ADR-0016](./docs/adr/0016-compiled-schemas-are-terminal.md)).
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
