# Concepts

The words the other pages use, in plain terms. Each one links back here the first time it appears on a page.

## Validating

### Schema

A description of what a value must look like: `pvl.string().min(3)` says "a string of at least 3 characters". One Schema is one factory call (`pvl.string()`) with the methods chained onto it. A Schema can hold others: `pvl.array(pvl.string())` is a Schema, and so is its element `pvl.string()`.

### Result

What validating returns. Either `{ value }`, the accepted value (possibly converted), or `{ issues }`, every reason it was rejected. Validation never throws for a bad value.

### Issue

One reason a value was rejected: a `code` (`INVALID_TYPE`, `TOO_SMALL`, …), a `message` and a `path` to where it happened (`['tags', 1]`). A failure at the very top has no `path`.

### Type check

The first real check every Schema makes: is this a string, a number, an object…? A failed type check stops everything after it, so no later check ever sees a value of the wrong type. In code, it is `_checkType` on an interpreted Schema and `_emitBaseCheck` on an Emitter.

## Modifiers

### Modifier

A method that returns a new Schema with one more step: `.min(3)`, `.optional()`, `.refine(fn)`. Steps run in the order they were chained. The Schema it was called on is never changed.

### Pre-modifier and post-modifier

Where a Modifier's step runs:

- A **pre-modifier** runs before the type check: `.optional()`, `.nullable()`, `.coerce()`.
- A **post-modifier** runs after the type check passed: the Constraints, `.refine()`, `.strict()`, `.transform()`.

### Short-circuit

What `.optional()` and `.nullable()` do with the value they're there for: they accept it on the spot, and every check after them is skipped. Only a `.transform()` still runs.

### Shared Modifier and Local Modifier

A **Shared Modifier** is on every Schema: `.optional()`, `.nullable()`, `.coerce()`, `.refine()`, `.transform()`. A **Local Modifier** is on one kind only, like `string`'s `.min()` or `object`'s `.strict()`.

### Constraint

A built-in check a Local Modifier adds: "at least 3 characters" (`.min(3)`), "a whole number" (`.int()`). Your own check is a Refinement, not a Constraint.

### Refinement, Coercion, Transform

- A **Refinement** is your own yes/no check, added with `.refine(fn)`. It never changes the value.
- A **Coercion** converts the raw input before the type check, added with `.coerce()`: `'42'` becomes `42` for a number.
- A **Transform** converts the accepted value into something else at the very end, added with `.transform(fn)`. It ends the chain: nothing can be chained after it.

## The two ways to validate

### Interpreted Schema

What every `pvl.*` factory builds: a Schema object that validates by running its steps at runtime and calling the Schemas nested in it. See [Interpreted pipeline](./Interpreted-Pipeline.md).

### Compiled Schema

What the compiler writes for a Schema marked with `pvl.compile(...)`: a class whose `_validate` holds every check of the whole Schema as plain code, nested Schemas included. It accepts, rejects and reports exactly what the interpreted one does. See [Compiled schema runtime](./Compiled-Schema-Runtime.md).

### Marked-to-Compile Schema

A Schema wrapped in `pvl.compile(...)`. Until the compiler has run, `pvl.compile(x)` just hands `x` back, so the code works the same before and after compiling.

## The compiler

### Module

One source file the compiler reads, chosen by `include` in `pvlconfig.json`.

### Destination Directory

The folder the compiler writes, `.pvl/` by default: a copy of your source folder where each `pvl.compile(...)` call is replaced by its Compiled Schema. Your application imports from it instead of from the source, usually by pointing an import alias at it. Your own files are never changed.

### Diagnostic

A problem a compiler run reports, with a stable code such as `UNSUPPORTED_SCHEMA`. Any error means nothing is written. Not to be confused with an Issue, which is a validation failure at runtime.

### Emitter

The compiler class that writes the code for one kind of Schema: `StringSchemaEmitter` writes a string's checks. It has one method per method of the interpreted Schema it mirrors.

### Frame

The part of the compiler that puts the pieces an Emitter wrote in the right order, wrapping each behind the check that must pass first. At the top, it also wraps the checks in the Compiled Schema's class.

### Instruction

One piece of the emitted code: an `if`, a loop, a property read. Plain JavaScript, not data that something interprets later.

### Runtime Argument

A method argument the compiler can't read as a literal, such as a variable: `max` in `pvl.string().max(max)`. The Compiled Schema evaluates it once, where it is written, and its checks read the stored value. A function passed to `.refine()` or `.transform()` is always one.

### Standalone Key

An object field marked `.standalone()`, so it can be validated on its own through the object's `shape`: `user.shape.email.validate(…)`. A compiled object gives each one a Compiled Schema of its own. See [Object schema](./Object-Schema.md#standalone-keys).
