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

**Parse Result**:
The outcome of validating a value against a Schema: either the accepted value (possibly transformed) or the list of Issues that failed it.
_Avoid_: Validation Result.

**Refinement**:
An extra, user-supplied predicate attached to a Schema that a value must satisfy in addition to the Schema's base shape. A Refinement only accepts or rejects a value — it never changes it (contrast Transform).
_Avoid_: Custom validator, constraint.

**Coercion**:
An explicit, opt-in conversion of an input value to a Schema's target type _before_ that value is checked against the Schema (e.g. the string `"5"` becomes the number `5`, which is then validated as a number).
_Avoid_: Cast, Transform.

**Transform**:
A user-supplied function that converts a Schema's accepted value into a different Output value as part of producing the Parse Result — unlike Coercion, which runs before validation, a Transform runs as validation succeeds, and unlike a Refinement, it changes the value rather than only accepting or rejecting it.
_Avoid_: Mapper, Coercion.

### AOT compiler

**AOT Compilation**:
Turning a Schema into a Compiled Validator before the program runs, as opposed to validating by walking the Schema tree at request time.
_Avoid_: JIT, runtime compilation.

**Compiled Validator**:
The artifact `@pvl/schema-compiler` produces for a given Schema: a standalone function built from Instructions that validates values of that Schema's shape without interpreting the Schema tree at runtime.
_Avoid_: Runtime validator (that names the interpreted path instead).

**Instruction**:
One primitive operation — a conditional check, a loop, a direct property read or assignment — emitted by the compiler to implement part of a Schema's validation logic.
_Avoid_: Opcode.
