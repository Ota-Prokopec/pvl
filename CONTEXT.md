# pvl

A TypeScript validation stack: a Zod-style schema library, and a compiler that turns those schemas into plain, dependency-free validation code ahead of time.

## Language

### Validation library

**Schema**:
A declarative description of the shape and constraints a value must satisfy. A composite Schema's fields and elements are themselves Schemas built by `@pvl/schema`; a Standard Schema from another library is never one ([ADR-0018](./docs/adr/0018-composite-fields-are-pvl-schemas-only.md)).
_Avoid_: Type, Model, Standard Schema (for this library's own Schemas).

**Issue**:
A single reported failure produced when a value doesn't satisfy a Schema.
_Avoid_: Error, Violation.

**Result**:
The outcome of validating a value against a Schema: either the accepted value (possibly transformed) or the list of Issues that failed it. The term is the name of the type `@pvl/schema`'s validation call returns, and the one used by the [Standard Schema](./docs/specification/standard-schema.md) specification the package conforms to.
_Avoid_: Validation Result, Parse Result.

**Modifier**:
A chainable method on a Schema that returns a new Schema with one more step added to how it validates, as opposed to a method that validates or reads it. Steps run in the order the Modifiers were chained ([ADR-0010](./docs/adr/0010-modifiers-run-in-chain-order-around-the-type-check.md)). Every Modifier is either a Shared Modifier or a Local Modifier.
_Avoid_: Combinator, wrapper.

**Shared Modifier**:
A Modifier every Schema offers, primitive or composite: `.optional()`, `.nullable()`, `.coerce()`, `.refine()` and `.transform()`. See [ADR-0006](./docs/adr/0006-chained-instance-method-api-via-shared-base-schema-class.md).
_Avoid_: Common modifier, base modifier, global modifier.

**Local Modifier**:
A Modifier only one kind of Schema offers, such as `string`'s `.min()` or `object`'s `.strict()`. What separates it from a Shared Modifier is reach, not importance. See [ADR-0006](./docs/adr/0006-chained-instance-method-api-via-shared-base-schema-class.md).
_Avoid_: Specific modifier, per-type modifier.

**Constraint**:
A built-in check on a value, such as "at least 3 characters" or "a whole number", that a Schema gains through a Local Modifier (`.min()`, `.max()`, `.length()`, `.int()`). Not every Local Modifier adds a Constraint: `object`'s `.strict()`/`.passthrough()` decide what happens to undeclared keys rather than checking a value. A user-supplied check is a Refinement, not a Constraint. See [ADR-0008](./docs/adr/0008-no-regex-backed-constraints-in-v1.md).
_Avoid_: Rule, validator, assertion.

**Refinement**:
An extra, user-supplied predicate attached to a Schema that a value must satisfy in addition to the Schema's base shape. A Refinement only accepts or rejects a value — it never changes it (contrast Transform). It is attached by `.refine()`, a Shared Modifier.
_Avoid_: Custom validator, constraint.

**Coercion**:
An explicit, opt-in conversion of an input value to a Schema's target type _before_ that value is checked against the Schema (e.g. the string `"5"` becomes the number `5`, which is then validated as a number). It is opted into by `.coerce()`, a Shared Modifier.
_Avoid_: Cast, Transform.

**Transform**:
A user-supplied function that converts a Schema's accepted value into a different Output value as part of producing the Result — unlike Coercion, which runs before validation, a Transform runs as validation succeeds, and unlike a Refinement, it changes the value rather than only accepting or rejecting it. It is attached by `.transform()`, a Shared Modifier, and turns the Schema into a Read-only Schema.
_Avoid_: Mapper, Coercion.

**Read-only Schema**:
A Schema no Modifier can be chained onto: one that ends in a Transform, or a Compiled Schema. It can still validate a value and still be a field or element of a composite Schema. See [ADR-0016](./docs/adr/0016-transform-and-compile-return-read-only-schemas.md).
_Avoid_: Terminal schema, frozen schema, Transformed Schema.

### AOT compiler

**AOT Compilation**:
Turning a Schema into a Compiled Schema before the program runs, as opposed to validating by walking the Schema tree at request time.
_Avoid_: JIT, runtime compilation.

**Compiled Schema**:
The artifact `@pvl/schema-compiler` produces for a Schema marked with `pvl.compile(...)`: a Read-only Schema backed by emitted Instructions rather than by walking the Schema tree. A compiled `object` or `array` that ends in no Transform still exposes its fields or element for reading. See [ADR-0016](./docs/adr/0016-transform-and-compile-return-read-only-schemas.md).
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
