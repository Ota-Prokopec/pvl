---
name: header-comment
description: Write the header comment for a function, type or variable, named as the argument.
argument-hint: "<name of the function, type or variable>"
disable-model-invocation: true
---

Write the header comment for the declaration named `$ARGUMENTS`. The rules for what a header comment says live in [`docs/standards/typescript.md`](../../../docs/standards/typescript.md#header-comments); this skill is the procedure that applies them.

1. **Locate** the declaration with Grep. It is done when exactly one declaration matches; if several do, ask which.
2. **Read** its body, its callers and its tests. It is done when you can state what it accepts, returns or changes, and what it rejects or ignores.
3. **Pick the form** from the declaration's kind and visibility:
   - Exported in a published package's barrel: `/** */` TSDoc for a consumer, per [`docs/standards/tsdoc.md`](../../../docs/standards/tsdoc.md).
   - Any other exported declaration: `/** */`.
   - Not exported: `//` lines directly above it.
4. **Write the comment** for the kind:
   - **Function**: a first line saying what it returns or changes, in the domain's words (a predicate opens with "Whether"). Then examples, each with its result beside it, covering what it handles, what it reports or rewrites and into what, and what it ignores or blocks. Wrap them in a ```` ```ts ```` fence in a `/** */` comment and indent them in a `//` comment.
   - **Type**: one sentence saying what the type models and who produces or consumes it. Add a short example value when the shape alone doesn't show it. A property whose meaning isn't obvious from its name gets its own one-line comment.
   - **Variable or constant**: one line saying what the value is and why it has that value, when the name and initializer don't already say.
5. **Verify every example** against the code and its tests. It is done when each example's result is one the code produces.
6. **Edit** the comment in place, replacing any existing header, and touch nothing else. Report the file and line.

## Shape

```ts
/**
 * Whether `moduleSpecifier` names a file relative to the importing one.
 *
 * ```ts
 * isRelativeModuleSpecifier('./user.js')      // true
 * isRelativeModuleSpecifier('@/schemas/user') // false: an alias or a package
 * ```
 */
export const isRelativeModuleSpecifier = (moduleSpecifier: string): boolean => {
```

```ts
// Whether an import declaration only runs its module and binds no name.
//
//   import './setup.js';                  // true
//   import { user } from './user.js';     // false
const isSideEffectOnlyImport = (declaration: ImportDeclaration): boolean => {
```

```ts
/** Extensions a module specifier may spell out, which a rewritten one keeps. */
const MODULE_SPECIFIER_EXTENSIONS: ReadonlySet<string> = new Set([...]);
```
