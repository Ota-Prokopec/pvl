# pvl

A TypeScript validation stack: a Zod-style schema library, and a compiler that turns those schemas into plain, dependency-free validation code ahead of time.

## Language

### Validation library

**Schema**:
A declarative description of the shape and constraints a value must satisfy, which values can be validated against. Not every Schema takes Modifiers; one that does is a Chainable Schema. In code, `Schema` is the abstract base class that owns the validation pipeline every Schema runs ([ADR-0020](./docs/adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md)). A composite Schema's fields and elements are themselves Schemas built by `@pvl/schema`; a Standard Schema from another library is never one ([ADR-0018](./docs/adr/0018-composite-fields-are-pvl-schemas-only.md)).
_Avoid_: Type, Model, Standard Schema (for this library's own Schemas).

**Issue**:
A single reported failure produced when a value doesn't satisfy a Schema.
_Avoid_: Error, Violation.

**Result**:
The outcome of validating a value against a Schema: either the accepted value (possibly transformed) or the list of Issues that failed it. The term is the name of the type `@pvl/schema`'s validation call returns, and the one used by the [Standard Schema](./docs/specification/standard-schema.md) specification the package conforms to.
_Avoid_: Validation Result, Parse Result.

**Modifier**:
A chainable method on a Chainable Schema that returns a new Schema with one more step added to how it validates, as opposed to a method that validates or reads it. Steps run in the order the Modifiers were chained ([ADR-0010](./docs/adr/0010-modifiers-run-in-chain-order-around-the-type-check.md)). Every Modifier is either a Shared Modifier or a Local Modifier.
_Avoid_: Combinator, wrapper.

**Shared Modifier**:
A Modifier every Chainable Schema offers, primitive or composite: `.optional()`, `.nullable()`, `.coerce()`, `.refine()` and `.transform()`. See [ADR-0006](./docs/adr/0006-chained-instance-method-api-via-shared-base-schema-class.md).
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
A user-supplied function that converts a Schema's accepted value into a different Output value as part of producing the Result — unlike Coercion, which runs before validation, a Transform runs as validation succeeds, and unlike a Refinement, it changes the value rather than only accepting or rejecting it. It is attached by `.transform()`, a Shared Modifier, and ends the chain: the result is a Schema that is no longer a Chainable Schema.
_Avoid_: Mapper, Coercion.

**Chainable Schema**:
A Schema Modifiers can still be chained onto: what every factory such as `pvl.string()` hands back, until a Transform or `pvl.compile(...)` ends the chain. A Schema past that point is just a Schema: it still validates and can still be a field, element or union member of a composite Schema. In code, `ChainableSchema` extends `Schema` with the Shared Modifiers only. See [ADR-0016](./docs/adr/0016-transform-and-compile-end-the-modifier-chain.md) and [ADR-0020](./docs/adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md).
_Avoid_: Read-only Schema (for a Schema that is not chainable, which is just a Schema), editable schema, base schema.

### AOT compiler

**AOT Compilation**:
Turning a Schema into a Compiled Schema before the program runs, as opposed to validating by walking the Schema tree at request time.
_Avoid_: JIT, runtime compilation.

**Marked-to-Compile Schema**:
A Schema passed to `pvl.compile(...)` in a scanned file, as the compiler reads it from the source before emitting anything. Each one that compiles becomes a Compiled Schema. See [ADR-0020](./docs/adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md).
_Avoid_: Compiled Schema (for the Schema before it is compiled).

**Compilable Schema**:
A Marked-to-Compile Schema the compiler can turn into a Compiled Schema: an object or an array whose own methods, and whose fields' or element's Schemas, are all ones an Emitter compiles, with literal arguments. Today that is a flat object or array of primitives, literals and enums with their Constraints and `.optional()`/`.nullable()`. One that isn't gets a Diagnostic per problem, and nothing is written. In code, `CompiledSchemaWriter.findUncompilableDiagnostics` decides it: none means compilable. See [compilation.md](./docs/specification/schema-compiler/compilation.md#what-reads-statically).
_Avoid_: Supported Schema, valid Schema.

**Compiled Schema**:
The artifact `@pvl/schema-compiler` produces for a Marked-to-Compile Schema: a plain Schema, never a Chainable Schema, backed by emitted Instructions rather than by walking the Schema tree. Its one `_checkType` holds the Instructions of the whole tree, nested Schemas inlined ([ADR-0023](./docs/adr/0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md)). It exposes no fields or element for reading, and there is no separate type for it. See [ADR-0016](./docs/adr/0016-transform-and-compile-end-the-modifier-chain.md) and [ADR-0020](./docs/adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md).
_Avoid_: Compiled Validator, Runtime validator.

**Emitter**:
The class in `@pvl/schema-compiler` that writes the Instructions for one schema type (`StringSchemaEmitter` for `StringSchema`), with one static method per method of that schema type, sharing its name and parameters. Every Emitter extends the base `Emitter`, which does the emitting, the way every Schema extends `Schema`. See [ADR-0023](./docs/adr/0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md) and [code-generation.md](./docs/specification/schema-compiler/code-generation.md).

**Instruction**:
One primitive operation — a conditional check, a loop, a direct property read or assignment — the compiler emits as literal inline JavaScript in a mirrored module of the Destination Directory. An Instruction is generated source text, never a data structure an interpreter later walks.
_Avoid_: Opcode.

**Destination Directory**:
The directory `@pvl/schema-compiler` writes: a mirror of the Root Directory holding one mirrored module per scanned file at the same relative path — marked Schemas as Compiled Schemas, everything else copied through, only module specifiers rewritten — plus a generated `index.ts` barrel. An application adopts it by pointing an alias at it. See [ADR-0005](./docs/adr/0005-compiler-emits-a-destination-directory-and-rewrites-nothing.md) for why it exists, [ADR-0015](./docs/adr/0015-compiled-schema-destination-resolution.md) for where it lands, and [destination-directory.md](./docs/specification/schema-compiler/destination-directory.md) for its layout.
_Avoid_: Destination File (the rejected single aggregate module), generated file, output bundle.

**Root Directory**:
The application's source root, set by `rootDir` (default `src`), that the Destination Directory mirrors: a scanned file at `<rootDir>/schemas/user.ts` is mirrored to `<destination>/schemas/user.ts`. Every scanned file must sit under it. See [destination-directory.md](./docs/specification/schema-compiler/destination-directory.md#a-complete-mirror-of-the-source-root).
_Avoid_: Source folder, schemas folder.

**Base Directory**:
The directory every relative path in a compiler run resolves against: the one holding `pvlconfig.json`, or the working directory for a run with no config file. It is what makes running from the repo root match running from the application directory, and keeps two applications' output apart. See [ADR-0015](./docs/adr/0015-compiled-schema-destination-resolution.md) and [configuration-and-cli.md](./docs/specification/schema-compiler/configuration-and-cli.md#the-base-directory).
_Avoid_: Root, base directory, project directory.

**Diagnostic**:
One problem a compiler run reports: a stable public code, a severity (`ERROR` stops anything being written; `WARNING` doesn't, unless the run is strict), a message and, where there is one, the file. Distinct from an Issue, which is a validation failure at runtime. See [configuration-and-cli.md](./docs/specification/schema-compiler/configuration-and-cli.md#diagnostics).
_Avoid_: Compiler error (a warning is a Diagnostic too).

### Imports

The three parts of an import the compiler reads, named after the fields of an ECMAScript [ImportEntry Record](https://tc39.es/ecma262/#importentry-record) (`[[ModuleRequest]]`, `[[ImportName]]`, `[[LocalName]]`). In `import { pvl as p } from '@pvl/schema';`, `'@pvl/schema'` is the Module Specifier, `pvl` the Import Name and `p` the Local Name.

**Module Specifier**:
The string after `from` naming the module an import reads from: `'@pvl/schema'`, `'./user.js'`, `'@/schemas/user'`. The compiler rewrites module specifiers in mirrored modules so they still resolve from the Destination Directory. See [destination-directory.md](./docs/specification/schema-compiler/destination-directory.md).
_Avoid_: Module expression, module name, import path.

**Import Name**:
The name a module exports and an import asks for: `pvl` in both `import { pvl } from '@pvl/schema'` and `import { pvl as p } from '@pvl/schema'`. The compiler recognises `pvl` by its Import Name, whatever Local Name it is bound to.
_Avoid_: Variable expression, imported variable.

**Local Name**:
The name an import binds in the importing module: `p` in `import { pvl as p } from '@pvl/schema'`, and `pvl` in `import { pvl } from '@pvl/schema'`, where it equals the Import Name. A `pvl.compile(...)` call is found by the Local Names of `pvl`, so `p.compile(...)` counts too.
_Avoid_: Alias, alias expression (an alias is a tsconfig `paths` entry such as `@/schemas/user`).
