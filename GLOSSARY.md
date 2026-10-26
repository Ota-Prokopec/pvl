# pvl

A TypeScript validation stack: a Zod-style schema library, and a compiler that turns those schemas into plain, dependency-free validation code ahead of time.

## Language

### Validation library

**Schema**:
A declarative description of the shape and constraints a value must satisfy, which values can be validated against. Not every Schema takes Modifiers; one that does is a Chainable Schema. In code, `Schema` is the interface every Schema implements, an Interpreted Schema and a Compiled Schema alike, kept nominal by a type-only brand ([ADR-0029](./docs/adr/0029-a-compiled-schema-is-a-class-expression-implementing-the-schema-type.md)), with `.standalone()` on it ([ADR-0036](./docs/adr/0036-standalone-keys-are-reinstated-and-shape-and-element-survive-every-call-but-transform.md)). One Schema is one factory call with its chained methods, and a composite Schema holds others: `pvl.array(pvl.string())` is a Schema, and so is its element `pvl.string()`. `@pvl/schema-compiler` has its own abstract `Schema` class, for one Schema written in a Module, read from source, with one subclass per factory, named for its schema type as its `@pvl/schema` counterpart is (`ObjectSchema` for `ObjectInterpretedSchema`, `EnumSchema`); each subclass reads its factory's argument and names its Emitter, and `compile()` compiles it whether it is marked to compile or not ([ADR-0026](./docs/adr/0026-the-compiler-reads-each-factory-into-its-own-schema-subclass.md)). `readSchema` (`src/schemas/readSchema.ts`) picks the subclass by its factory ([ADR-0034](./docs/adr/0034-every-factory-is-read-through-one-readschema-module-holding-the-factory-to-class-map.md)). A composite Schema's fields and elements are themselves Schemas built by `@pvl/schema`; a Standard Schema from another library is never one ([ADR-0018](./docs/adr/0018-composite-fields-are-pvl-schemas-only.md)).
_Avoid_: Type, Model, Standard Schema (for this library's own Schemas).

**Pvl Object**:
The `pvl` object `@pvl/schema` exports, which every Pvl Schema is built from: it holds one Pvl Factory per schema type and `compile`, which isn't one, as it builds no Schema but marks one for AOT Compilation. In code, `pvl` in `packages/schema/src/pvl.ts`, whose members `PvlObjectPropertyName` names.
_Avoid_: pvl namespace, Schema builder, factory object.

**Pvl Factory**:
A method of the Pvl Object that builds a Pvl Schema of one schema type, such as `pvl.string`, `pvl.object` or `pvl.enum`. A Pvl Factory takes no options, only its schema type's own argument, such as an object's shape ([ADR-0019](./docs/adr/0019-factories-take-no-options.md)). In code, `PvlFactoryName` (`packages/schema/src/types.ts`) names each one; in `@pvl/schema-compiler`, each has its own `Schema` subclass ([ADR-0026](./docs/adr/0026-the-compiler-reads-each-factory-into-its-own-schema-subclass.md)).
_Avoid_: Schema constructor, builder, creator.

**Pvl Schema**:
A Schema built from the Pvl Object: one Pvl Factory call and every method chained onto it, such as `pvl.string()` or `pvl.number().max(10).min(0)`, a Transform included. Every Pvl Schema is an Interpreted Schema. The Schema a `pvl.compile(...)` call wraps is one, but the Compiled Schema that replaces the call isn't, and neither is a Standard Schema from another library. In code, `PvlSchemaPropertyName`, `PvlSchemaMethodName` and `PvlSchemaModifierMethodName` (`packages/schema/src/types.ts`) name the members a Pvl Schema can have.
_Avoid_: Factory Schema, built Schema.

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

**Interpreted Schema**:
A Schema that validates by running its own tree at runtime: it runs its Modifiers around its type check, in chain order, and calls each Schema it holds. Every factory such as `pvl.string()` builds one, and `pvl.compile(...)` hands back the one it wraps until the compiler has replaced the call. In code, `InterpretedSchema` is the abstract class that owns the validation pipeline and implements `Schema`; every factory's class extends it through `ChainableInterpretedSchema` and is named after it (`StringInterpretedSchema`). See [ADR-0020](./docs/adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md) and [ADR-0029](./docs/adr/0029-a-compiled-schema-is-a-class-expression-implementing-the-schema-type.md).
_Avoid_: Runtime Schema, uncompiled Schema.

**Chainable Schema**:
A Schema Modifiers can still be chained onto: what every factory such as `pvl.string()` hands back, until a Transform or `pvl.compile(...)` ends the chain. `.standalone()` doesn't: it hands the Schema back as its own class, marked. A Schema past that point is just a Schema: it still validates and can still be a field, element or union member of a composite Schema. In code, `ChainableInterpretedSchema` extends `InterpretedSchema` with the Shared Modifiers only. See [ADR-0016](./docs/adr/0016-transform-and-compile-end-the-modifier-chain.md) and [ADR-0020](./docs/adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md).
_Avoid_: Read-only Schema (for a Schema that is not chainable, which is just a Schema), editable schema, base schema.

**Standalone Key**:
A field of an object Schema marked `.standalone()`: the only kind of key in that object's `shape`, interpreted and compiled alike, so it can be validated on its own, and the only kind the compiler emits a Compiled Schema of its own for, reachable as `compiled.shape.<key>`. An array's element marked `.standalone()` is compiled the same way, though `element` is there either way. The marker changes no check, keeps the chain going, so it can be written anywhere in it, and is valid on any Schema, a field or not. Each Modifier after it, a Transform included, keeps it. In code, `.standalone()` on the `Schema` interface, the type-only `StandaloneMarker` it adds, and the `@internal` `_standalone` flag an object reads at runtime; in `@pvl/schema-compiler`, `Schema.isStandalone`. See [ADR-0036](./docs/adr/0036-standalone-keys-are-reinstated-and-shape-and-element-survive-every-call-but-transform.md) and [standalone-keys.md](./docs/specification/standalone-keys.md).
_Avoid_: Exposed key, public key, standalone field.

### AOT compiler

**AOT Compilation**:
Turning a Schema into a Compiled Schema before the program runs, as opposed to validating by walking the Schema tree at request time.
_Avoid_: JIT, runtime compilation.

**Marked-to-Compile Schema**:
A Schema passed to `pvl.compile(...)` in a Module, as the compiler reads it from the source before emitting anything. A Module holds any number of them, and each one belongs to exactly one Module. Each one that compiles becomes a Compiled Schema. In code, `findMarkedToCompileSchemas` (`src/schemas/readSchema.ts`) finds a Module's, each a compiler `Schema` read through its `pvl.compile(...)` call, and they are the only Schemas the compiler passes to `Module.compileSchemas`. See [ADR-0020](./docs/adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md).
_Avoid_: Compiled Schema (for the Schema before it is compiled).

**Compilable Schema**:
A Marked-to-Compile Schema the compiler can turn into a Compiled Schema: any Schema, primitive or composite, whose own methods, and every Schema nested in it at any depth, are all ones an Emitter compiles, every factory's argument read statically and no method argument spread. Today that is a primitive, a literal, an enum, or an object or array of them and of nested objects and arrays, with their Constraints, `.strict()`/`.passthrough()` and `.optional()`/`.nullable()`, on the wrapped Schema itself as on any nested one. One that isn't gets a Diagnostic per problem, and nothing is written. In code, `Schema.findUncompilableDiagnostics` decides it: none means compilable. See [compilation.md](./docs/specification/schema-compiler/compilation.md#what-reads-statically).
_Avoid_: Supported Schema, valid Schema.

**Compiled Schema**:
The artifact `@pvl/schema-compiler` produces for a Marked-to-Compile Schema: a plain Schema, never a Chainable Schema, backed by emitted Instructions rather than by walking the Schema tree. In code, it is an instance of a class expression written where its `pvl.compile(...)` call was, which implements `Schema` and extends no class; its one `_validate` holds the Instructions of the whole tree, nested Schemas inlined ([ADR-0023](./docs/adr/0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md), [ADR-0029](./docs/adr/0029-a-compiled-schema-is-a-class-expression-implementing-the-schema-type.md)). A compiled object exposes its Standalone Keys through `shape`, each a Compiled Schema of its own, and a compiled array its `element`, as the interpreted one does, unless it is transformed ([ADR-0036](./docs/adr/0036-standalone-keys-are-reinstated-and-shape-and-element-survive-every-call-but-transform.md)); there is no separate type for it, as `pvl.compile()` types it as a plain `Schema` keeping that `shape` or `element`. See [ADR-0016](./docs/adr/0016-transform-and-compile-end-the-modifier-chain.md) and [ADR-0020](./docs/adr/0020-schema-class-owns-the-pipeline-and-compile-returns-a-plain-schema.md).
_Avoid_: Compiled Validator, Runtime validator.

**Runtime Argument**:
A method's argument in a Marked-to-Compile Schema that isn't a literal written in place, such as a `const`, a parameter, a `let`, an import or a call: `maxLength` in `(maxLength: number) => pvl.compile(pvl.string().max(maxLength))`. The Compiled Schema evaluates it once, where it is written, as the interpreted path does, builds any default message naming it once, and its checks read the stored values. Only a method's arguments can be one, never a factory's. In code, `RuntimeArgument` in `src/schemas/runtimeArgument.ts`; one written in a `const` the call follows is hoisted into a `const pvlArg<n>` in the mirror. A function passed to `.refine()` or `.transform()` is always one, which the Compiled Schema calls rather than inlining it ([ADR-0035](./docs/adr/0035-modifiers-compile-to-calls-to-the-users-own-functions-typed-at-their-place-in-the-chain.md)). See [ADR-0030](./docs/adr/0030-a-method-argument-the-compiler-cant-read-is-a-runtime-argument-evaluated-once-where-it-is-written.md) and [compilation.md](./docs/specification/schema-compiler/compilation.md#runtime-arguments).
_Avoid_: Dynamic argument, captured argument, snapshot argument.

**Emitter**:
The class in `@pvl/schema-compiler` that writes the Instructions for one schema type (`StringSchemaEmitter` for `StringInterpretedSchema`), with one method per method of that schema type, sharing its name and, through `EmitterMethodOf`, its parameter types, held in a table of the kind of text it writes (`postModifierChecks`), which a chained method is dispatched through ([ADR-0033](./docs/adr/0033-an-emitter-dispatches-chained-methods-through-typed-method-tables.md)). Every Emitter extends the abstract base `Emitter`, which emits a Schema's parts as source text for its Frame to compose, the way every Interpreted Schema extends `InterpretedSchema`. Each compiler `Schema` subclass names its Emitter (`StringSchema.emitter`), which its type, `SchemaEmitter`, requires to write its base check ([ADR-0032](./docs/adr/0032-an-emitter-returns-a-schemas-parts-and-the-frame-composes-them-as-a-pure-function.md)), and each Emitter's hooks take that subclass; a subclass with none (`UnionSchema`) can't be compiled yet ([ADR-0026](./docs/adr/0026-the-compiler-reads-each-factory-into-its-own-schema-subclass.md)). See [ADR-0023](./docs/adr/0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md), [ADR-0028](./docs/adr/0028-emitter-methods-return-source-text-only.md) and [code-generation.md](./docs/specification/schema-compiler/code-generation.md).

**Frame**:
Where one Schema's checks are composed, at the root of a Compiled Schema's `_validate` or nested where a parent reads the value. Its Emitter emits the parts as source text, all in one `SchemaParts` value (base check, pre-modifiers' short-circuit conditions, post-modifiers' checks, and, for a composite, its locals, declarations, children's checks and output), and the Frame's pure functions only join them and put them in order and behind the gates they need, the same at the root as nested, declaring a composite's path local, which its children's and post-modifiers' Issue paths extend, and its Issue-count local, which its post-modifiers' gate reads. At the root, the Frame also wraps them in the Compiled Schema's class expression. In code, the static `Frame` in `src/emitters/frame.ts`. See [ADR-0027](./docs/adr/0027-the-frame-composes-emitters-emit-and-the-root-frame-writes-the-compiled-schema.md), [ADR-0028](./docs/adr/0028-emitter-methods-return-source-text-only.md), [ADR-0031](./docs/adr/0031-the-root-schema-compiles-as-a-nested-one-under-one-closing-return.md) and [ADR-0032](./docs/adr/0032-an-emitter-returns-a-schemas-parts-and-the-frame-composes-them-as-a-pure-function.md).
_Avoid_: EmitFrame, emit frame.

**Instruction**:
One primitive operation — a conditional check, a loop, a direct property read or assignment — the compiler emits as literal inline JavaScript in a mirrored module of the Destination Directory. An Instruction is generated source text, never a data structure an interpreter later walks.
_Avoid_: Opcode.

**Destination Directory**:
The directory `@pvl/schema-compiler` writes: a mirror of the Root Directory holding one mirrored module per scanned file at the same relative path — marked Schemas as Compiled Schemas, everything else copied through, only module specifiers rewritten — and no file the Root Directory lacks: no barrel is generated. An application adopts it by pointing an alias at it. See [ADR-0005](./docs/adr/0005-compiler-emits-a-destination-directory-and-rewrites-nothing.md) for why it exists, [ADR-0015](./docs/adr/0015-compiled-schema-destination-resolution.md) for where it lands, and [destination-directory.md](./docs/specification/schema-compiler/destination-directory.md) for its layout.
_Avoid_: Destination File (the rejected single aggregate module), generated file, output bundle.

**Module**:
One file `include` matches, as the compiler reads it: it is prechecked, its Marked-to-Compile Schemas are compiled, and it is mirrored into the Destination Directory as a mirrored module. In code, `Module` places the file in the mirror and rewrites it there: `compileSchemas(schemas)` compiles every Schema it is given with `schema.compile()`, putting each Compiled Schema in place of the Schema's expression, and its module specifiers are rewritten to reach the right files from the mirror. Under `withTypes`, `compile` also appends each exported Schema's Type Aliases. Every check of it, and the DUPLICATE_EXPORT check across Modules, is `Precheck`'s (`src/precheck.ts`).
_Avoid_: Scanned Module.

**Type Alias**:
One of the two exported types `withTypes` appends to a mirrored module for each Schema it exports: `<Name>Input`, its Input, and `<Name>Output`, its Output, read from the mirror's own binding through `typeof`, never spelled out. In code, `Module.compile` (`src/module.ts`). See [ADR-0036](./docs/adr/0036-type-aliases-read-the-mirrored-binding-through-typeof.md) and [destination-directory.md](./docs/specification/schema-compiler/destination-directory.md#type-aliases).
_Avoid_: Generated types, Data type.

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
