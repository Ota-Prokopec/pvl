# Compiler build pipeline

What `pvl compile` does, from reading `pvlconfig.json` to writing the [Destination Directory](./Concepts.md#destination-directory). This part is the same for every [Schema](./Concepts.md#schema). Each schema page shows only what its own [Emitter](./Concepts.md#emitter) adds, and [Compiled schema runtime](./Compiled-Schema-Runtime.md) shows how the written code runs.

## The short version

The compiler never runs or imports your code. It parses your files as text (with [ts-morph](https://ts-morph.com)), finds every `pvl.compile(...)` call, reads the Schema inside it, and writes a copy of your source folder with each call replaced by plain validation code.

```mermaid
flowchart LR
    CFG["pvlconfig.json<br/>+ CLI flags"] --> SCAN["find the files<br/>include matches"]
    SCAN --> READ["parse them and read<br/>each pvl.compile(...)"]
    READ --> CHECK{"any error?"}
    CHECK -- yes --> STOP["report the Diagnostics,<br/>write nothing"]
    CHECK -- no --> EMIT["emit each Compiled Schema<br/>into a mirror of the file"]
    EMIT --> WRITE["write the<br/>Destination Directory"]
```

## The whole run

`pvl compile` (`bin.ts` → `runCli`) parses the flags and calls `runCompilation`, the programmatic entry point. Every step that can fail adds a [Diagnostic](./Concepts.md#diagnostic) and keeps going, so one run lists every problem at once. Only when there are none is anything written.

```mermaid
flowchart TD
    CLI["pvl compile --flags<br/>runCli"] --> RC["runCompilation"]
    RC --> CR["ConfigResolver.resolveConfig<br/>flags, then pvlconfig.json, then defaults;<br/>finds the base directory"]
    CR --> CRD{"settings valid?"}
    CRD -- no --> E1["NO_CONFIG, CONFIG_UNREADABLE,<br/>INVALID_CONFIG"]
    CRD -- yes --> PAR["in parallel"]
    PAR --> DW["DestinationWriter.checkDestination<br/>DESTINATION_UNWRITABLE, DESTINATION_NOT_EMPTY"]
    PAR --> SC["Scanner.scan<br/>the files include matches;<br/>NO_INPUT_FILES, DESTINATION_INSIDE_INCLUDE"]
    DW --> TSP["TsMorphProject.create<br/>reads tsconfig.json for alias paths;<br/>TSCONFIG_UNREADABLE"]
    SC --> TSP
    TSP --> MOD["Scanner.getModules<br/>one Module per file"]
    MOD --> PC["Precheck.precheckModules<br/>(next graph)"]
    PC --> ERR{"any error?<br/>(or any warning with --strict)"}
    ERR -- yes --> NOWRITE["print the Diagnostics, exit 1,<br/>write nothing"]
    ERR -- no --> CA["compileAll<br/>Module.compile for each file"]
    CA --> WD["DestinationWriter.writeDestination<br/>into .pvl.pvl-tmp, then swapped in"]
    WD --> DONE["exit 0"]
```

## Reading the Schemas: `Precheck`

`Precheck` checks each [Module](./Concepts.md#module) and reads its [Marked-to-Compile Schemas](./Concepts.md#marked-to-compile-schema). Reading is purely static: a Schema must be a `pvl.*` call chain written in place, or a top-level `const` of the same file holding one.

```mermaid
flowchart TD
    M["Module"] --> P1{"parses?"}
    P1 -- no --> PF["PARSE_FAILED<br/>(only FILE_OUTSIDE_ROOT_DIR<br/>is checked besides)"]
    P1 -- yes --> P2["FILE_OUTSIDE_ROOT_DIR, DEFAULT_EXPORT,<br/>FILE_EXPORTS_NOTHING, SIDE_EFFECT_COPIED"]
    P2 --> FM["findMarkedToCompileSchemas"]
    FM --> LN["PvlAst.findPvlImportLocalNames<br/>the names pvl is imported under"]
    LN --> CALLS["PvlAst.findCompileCalls<br/>every pvl.compile(...) call"]
    CALLS --> MODQ{"a method chained onto<br/>the result? .optional()…"}
    MODQ -- yes --> CRM["COMPILE_RESULT_MODIFIED"]
    MODQ -- no --> RS["readSchema<br/>(next graph)"]
    RS --> RSQ{"read statically?"}
    RSQ -- no --> CAU["COMPILE_ARGUMENT_UNRESOLVABLE,<br/>COMPILE_ARGUMENT_CYCLE"]
    RSQ -- yes --> UC["schema.findUncompilableDiagnostics"]
    UC --> UCQ{"an Emitter for it, its every<br/>method, and every nested Schema?"}
    UCQ -- no --> US["UNSUPPORTED_SCHEMA"]
    UCQ -- yes --> OK["a Compilable Schema,<br/>handed to Module.compile"]
```

`readSchema` turns one call chain into a tree of compiler `Schema` objects, one subclass per factory, each naming its Emitter:

```mermaid
flowchart TD
    EXP["pvl.compile(pvl.object({ name: pvl.string().max(max) }).strict())"] --> RCC["PvlAst.readCallChain<br/>splits it into the factory call<br/>and the methods chained after it"]
    RCC --> F{"factory?"}
    F -- "compile" --> RCC2["read its argument the same way,<br/>keeping the methods chained outside"]
    RCC2 --> F
    F -- "not a pvl factory" --> UNR["COMPILE_ARGUMENT_UNRESOLVABLE"]
    F -- "string, number, object…" --> MAP["SCHEMA_CLASS_BY_FACTORY<br/>object → ObjectSchema"]
    MAP --> RFA["ObjectSchema.readFactoryArgument<br/>reads the shape; each field<br/>through readNested, recursively"]
    MAP --> RMC["readMethodCall for each chained method<br/>.standalone() only sets isStandalone;<br/>.transform() is split off as transformCall"]
    RMC --> ARG{"each argument a literal<br/>written in place?"}
    ARG -- "yes: 3, 'a', { message: 'x' }" --> LIT["read as a value,<br/>written into the code later"]
    ARG -- "no: max, getMax(), a function" --> RA["a RuntimeArgument,<br/>evaluated by the Compiled Schema"]
    RFA --> TREE["ObjectSchema { calls: [strict],<br/>shape: [name: StringSchema { calls: [max] }] }"]
    LIT --> TREE
    RA --> TREE
```

A literal argument is baked into the code. Anything else is a [Runtime Argument](./Concepts.md#runtime-argument), passed to the Compiled Schema's constructor and evaluated once, where it is written.

## Writing a file: `Module.compile`

Each scanned file becomes one mirrored file at the same path under the Destination Directory, whether or not it marks a Schema.

```mermaid
flowchart TD
    MC["Module.compile"] --> HO["nameHoistedArguments<br/>a Runtime Argument in a top-level const<br/>the call follows → const pvlArg0 = …"]
    HO --> CS["compileSchemas: for each Compilable Schema"]
    CS --> SCOMP["schema.compile()<br/>→ its Emitter's emitCompiledSchema"]
    SCOMP --> EMIT["the Emitter writes the parts,<br/>the Frame composes the class<br/>(Compiled schema runtime)"]
    EMIT --> REP["the class expression replaces<br/>the pvl.compile(...) call in the text"]
    REP --> IMP["add a type-only import of<br/>Schema, Issue, Result… from @pcvl/schema"]
    IMP --> SPEC["rewrite module specifiers so they<br/>still resolve from the mirror"]
    SPEC --> OUT["the mirrored file's text"]
```

Only the outermost `pvl.compile(...)` is replaced: one nested inside another's argument is compiled into it. A file with no `pvl.compile(...)` is copied with only its module specifiers rewritten.

## Example

The source file `src/schemas/string.ts`:

```ts
import { pvl } from '@pcvl/schema';

export const username = pvl.compile(pvl.string().min(3).max(20));
```

becomes `.pvl/schemas/string.ts` (the class body is shortened here; [String schema](./String-Schema.md#compiled) shows it whole):

<!-- prettier-ignore -->
```ts
// @generated by @pcvl/compiler. Do not edit: run `pvl compile` to regenerate.
import { pvl } from '@pcvl/schema';
import type { Issue as PvlIssue, Result as PvlResult, SCHEMA_BRAND as PVL_SCHEMA_BRAND, Schema as PvlSchema, StandaloneMarker as PvlStandaloneMarker, StandardSchemaProps as PvlStandardSchemaProps } from '@pcvl/schema';

export const username = (new (class PvlCompiledSchema0 implements PvlSchema<string, string> {
  …
  _validate(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
    const issues: PvlIssue[] = [];
    if (typeof value !== "string") {
      issues.push({ code: "INVALID_TYPE", message: "Expected string", path: path.length > 0 ? path : undefined });
    } else {
      if (value.length < 3) { … }
      if (value.length > 20) { … }
    }
    return issues.length > 0 ? { issues } : { value };
  }
  …
})() as PvlSchema<string, string>);
```

plus a `.pvl-generated` marker so a later run knows it may replace the folder.

## Source

- [`cli/runCli.ts`](../../packages/compiler/src/cli/runCli.ts), [`compilation/runCompilation.ts`](../../packages/compiler/src/compilation/runCompilation.ts), [`compilation/compileAll.ts`](../../packages/compiler/src/compilation/compileAll.ts)
- [`config/configResolver.ts`](../../packages/compiler/src/config/configResolver.ts), [`scanner/scanner.ts`](../../packages/compiler/src/scanner/scanner.ts), [`tsMorphProject/tsMorphProject.ts`](../../packages/compiler/src/tsMorphProject/tsMorphProject.ts)
- [`precheck/precheck.ts`](../../packages/compiler/src/precheck/precheck.ts), [`schemas/readSchema.ts`](../../packages/compiler/src/schemas/readSchema.ts), [`schemas/schema.ts`](../../packages/compiler/src/schemas/schema.ts), [`runtimeArgument/runtimeArgument.ts`](../../packages/compiler/src/runtimeArgument/runtimeArgument.ts)
- [`ast/pvlAst.ts`](../../packages/compiler/src/ast/pvlAst.ts), [`ast/genericAst.ts`](../../packages/compiler/src/ast/genericAst.ts)
- [`module/module.ts`](../../packages/compiler/src/module/module.ts), [`destination/destinationWriter.ts`](../../packages/compiler/src/destination/destinationWriter.ts)

Further reading: [compilation.md](../specification/compiler/compilation.md), [configuration-and-cli.md](../specification/compiler/configuration-and-cli.md), [destination-directory.md](../specification/compiler/destination-directory.md), [ADR-0002](../adr/0002-static-ast-compilation-via-ts-morph.md), [ADR-0005](../adr/0005-compiler-emits-a-destination-directory-and-rewrites-nothing.md).
