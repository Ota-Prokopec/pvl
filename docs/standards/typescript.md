# TypeScript

How to write TypeScript in this repo. `pnpm lint` enforces the mechanical rules, and its messages say what to do; this file holds the judgment calls. Enums and constants have their own file: [enums-and-constants.md](../specification/enums-and-constants.md).

## Naming functions and variables

A reader must know from the name alone what a function does or what a variable holds, without reading its body or its declaration.

- **A function's name is a verb phrase saying what it does to what:** `findScannedFilePath`, `createParseFailureDiagnostics`, not `resolve`, `claim` or `findCycles`. A predicate reads as a question: `isSideEffectOnlyImport`, `hasAnyExport`.
- **A variable's name says what the value is, not its shape or where it came from:** `moduleSpecifier`, not `raw`; `importBindings`, not `imports`; `scannedTargetPath`, not `target`. Never `context`, `entry`, `node`, `data`, `item` or `result` alone.
- **A map is named `<value>By<Key>`:** `finalNameByOriginKey`, `moduleContextByPath`.
- **A name stays the same across the code it passes through:** a value named `exportedName` in one function isn't `name` in the next, and a destructured property keeps its name.

## Header comments

Every function has a JSDoc comment (`/** */`) directly above it that tells a reader what it does without reading its body. It is always `/** */`, exported or not, class members included: editors such as VS Code show only a JSDoc comment on hover, and a `//` comment isn't one. See [tsdoc.md](./tsdoc.md) for a published package's exported API.

- **Say what it returns or changes, in the domain's words**, not how the body works.
- **Show examples of the code it handles:** what it accepts, what it reports or rewrites and into what, and what it ignores or blocks, each with the result beside it.
- **Put the examples in a ` ```ts ` fence** inside the comment, so the editor renders them as code. Start each line with `*`. A step list is a Markdown list (`1.`), with a blank ` *` line before it and before the fence.

````typescript
/**
 * Whether an import declaration only runs its module and binds no name.
 *
 * ```ts
 * import './setup.js';              // true
 * import { user } from './user.js'; // false
 * ```
 */
````

- **Keep the examples true.** Check each one against the code and its tests; a wrong example misleads more than none.

## Naming types

A type's suffix says its role:

- **`Args`**: a function's parameters, wrapped into one descriptive object type.
- **`Options`**: a class's constructor or initialization options.
- **`Payload`**: a complex return type that only that one function returns. Reach for it last (see [Using types](#using-types)).

```typescript
type RegisterUserArgs = {
  email: string;
  username: string;
};

type LoggerOptions = {
  level: string;
  silent: boolean;
};

class Logger {
  constructor(options: LoggerOptions) {}
}

type CalculateTotalPayload = {
  result: number;
};
```

## Naming a class's module

A module that exports a class has the same name as that class, except for the first letter: the class's is uppercase, the module's is lowercase. A reader then finds a class by its name alone.

```typescript
// destinationWriter.ts
export class DestinationWriter {}

// tsMorphProject.ts
export class TsMorphProject {}
```

## Using types

- **Export a function's or class's parameter and return types** alongside it.
- **Return a broad type, not a payload made for one function.** Before you write a function's return type, look for a type in the repo that already describes the value, and return that. When none does, create one, as a generic type when the shape doesn't depend on what it holds, so long as its purpose is broad: a type that describes the value as the domain sees it, which later functions could reuse for other purposes. It doesn't have to be used by another function yet, only able to be. Write a `Payload` type only when the value is so specific to its function that no other purpose could reuse it.
- **Annotate a variable with the repo's existing type for its value.** When a type anywhere in the repo describes what the variable holds, write `const scope: ScanScope = {…}`, not `const scope = {…}`, so the compiler checks the value against that type at the declaration.
- **Never annotate a variable with a function's payload type.** A `<Function>Payload` only restates the return type of the call it is assigned from, so the annotation checks nothing. Annotate a variable only with a broad type that describes the value itself, and otherwise let TypeScript infer it from the call.

```typescript
// Wrong: the annotation is only writeDestination's own payload type.
const writtenDestination: WriteDestinationPayload = await writeDestination(args);

// Right: `Destination` is a broad type describing the value itself, which writeDestination returns.
const writtenDestination: Destination = await writeDestination(args);

// Right: no broad type fits, so the payload type is inferred.
const writtenDestination = await writeDestination(args);
```

- **Narrow with type guards and type predicates**, starting from `unknown` where a type is genuinely unknown, so the compiler checks the narrowing an assertion would only claim.

```typescript
type Admin = { role: 'admin' };
type Guest = { role: 'guest' };

const isAdmin = (user: Admin | Guest): user is Admin => {
  return user.role === 'admin';
};
```

## Importing Node built-ins

- **Import a Node built-in module as a namespace** and call it through that namespace, so a call site shows where the function comes from. Name the namespace after the module: `path` for `node:path`, `fs` for `node:fs`, `fsPromises` for `node:fs/promises`.

```typescript
// Wrong
import { resolve } from 'node:path';
const absolutePath = resolve(rootPath, 'src');

// Right
import * as path from 'node:path';
const absolutePath = path.resolve(rootPath, 'src');
```

## Barrels

A module whose exports aren't public API (e.g. `src/modifiers/` in `@pvl/schema`) stays out of its package's barrel, and the barrel names it in a comment saying why. Every other module is exported through the barrel.
