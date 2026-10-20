# A method argument the compiler can't read is a Runtime Argument, evaluated once where it is written

**A method's argument that doesn't read statically is a Runtime Argument rather than an error.** That covers a parameter, a `let`, an import, a call, a property read and an operator, `++count` included. The compiler copies the argument as written into the Compiled Schema, which evaluates it. Before, it was `COMPILE_ARGUMENT_UNRESOLVABLE`, so a Schema built from a value only known at runtime couldn't be compiled at all:

```ts
export const getUser = (maxLength: number) => pvl.compile(pvl.string().max(maxLength));
```

Only a method's arguments can be Runtime Arguments: a Constraint's value (`.max(maxLength)`) and Issue options, whole or with a value inside (`.min(1, options)`, `{ message }`). A factory's argument stays static, as before (`pvl.literal(…)`, `pvl.enum(…)`, an object's shape, an array's element, a union's members). It decides the Schema's types, which the compiler spells out without checking types ([ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)), or the structure it inlines ([ADR-0023](./0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md)). An argument that still reads statically, such as `3` or a top-level `const MAX = 3`, is still written into the checks as a literal.

**A Runtime Argument is evaluated once, where it is written, as the interpreted path evaluates it.** An interpreted Schema evaluates `maxLength` when `pvl.string().max(maxLength)` runs and keeps the value, so a later change to the variable doesn't reach it, and `.max(getMax())` calls `getMax()` once. A Compiled Schema whose checks read the variable through a closure would disagree on both: `for (var i = 1; i <= 3; i++) pvl.compile(pvl.string().max(i))` would give three Schemas of `max 4`. So the class expression ([ADR-0029](./0029-a-compiled-schema-is-a-class-expression-implementing-the-schema-type.md)) takes each one through its constructor, the arguments written as they were, in source order, and its checks read the stored value (`this.arg0`):

```ts
export const getUser = (maxLength: number) => (new (class PvlCompiledSchema0 implements PvlSchema<string, string> {
  declare readonly [PVL_SCHEMA_BRAND]: true;

  constructor(readonly arg0: number) {}
  …
      if (value.length > this.arg0) { issues.push({ code: "TOO_BIG", message: "String must contain at most " + this.arg0 + " character(s)", … }); }
  …
})(maxLength) as PvlSchema<string, string>);
```

The constructor call sits where the `pvl.compile(...)` call was. So the arguments run at the same moment and in the same order as the interpreted path's, and in the same scope: `this.limit`, `await getLimit()` and a parameter that shadows a top-level `const` mean what they meant there. Each parameter is typed from the method it is passed to, as its Emitter spells it (`parameterTypes`).

**One written in a top-level `const` the call follows is hoisted.** In `const base = pvl.string().max(getMax()); export const getUser = () => pvl.compile(base)`, passing `getMax()` at the call would run it on every `getUser()` call, and once more for the interpreted `base` the mirror still holds. A name copied there could also bind to something else. So the mirror rewrites the declaration: `const pvlArg0 = getMax();` goes right before its declarator, which then reads `pvlArg0`, as does every call it reaches. A declarator after the first in its statement is split off into a statement of its own, so the argument still runs after the declarators before it. The name `pvlArg<n>` is one the module doesn't use, so nothing shadows it.

**A default message that names a Runtime Argument is built at runtime** around the literal text of `<SCHEMA>_SCHEMA_ISSUE_MESSAGE`, as `.strict()`'s message already was around the key. Issue options passed as a Runtime Argument are read when the Issue is built, as the interpreted path reads them: `(this.arg1?.message ?? <default>) || "Invalid type"`.

## Consequences

- Amends [ADR-0025](./0025-static-reading-never-evaluates-an-assignment.md): the compiler still never evaluates an assignment, but `++count` as a method's argument is now a Runtime Argument. It runs once at runtime, side effect included, as in the interpreted path, so the reason it was rejected no longer applies.
- Narrows [ADR-0002](./0002-static-ast-compilation-via-ts-morph.md)'s trade-off, that only statically resolvable Schemas compile, to a Schema's structure and types.
- `COMPILE_ARGUMENT_UNRESOLVABLE` now covers a factory's argument the compiler can't read, and a spread method argument (`.max(...limits)`, `{ ...options }` written in place), which has no fixed position to pass it at.
- The mirror rewrites a top-level `const` declaration outside any `pvl.compile(...)` call when it holds a hoisted argument. Until now it rewrote only the calls and the module specifiers.
- A Constraint checks against a property read (`this.arg0`) rather than a literal, which the engine can't fold. Only what can't be read statically pays for it.
- A message built around a value assumes the message writes the value as it is. One that formats it would come out wrong, which the differential test would catch.

## Considered options

- **Read the variable through the class expression's closure.** Shorter. Rejected: it reads the value at every call, so it disagrees with the interpreted path whenever the variable changes or the argument is a call, unless the compiler rejects every such argument, which needs the variable tracking ADR-0025 avoids.
- **Only names (parameters, `let`s, imports), not calls or operators.** Rejected: evaluated once where written, any expression behaves as in the interpreted path, so a narrower rule would only reject code that works.
- **Copy an argument in a followed `const` to the call, or reject it.** Rejected: copying runs it at a different time, more often, and maybe against a different binding, and rejecting leaves such a Schema uncompilable wherever it is followed.
- **Field initializers in the class expression instead of constructor parameters**, which would need no type spelled. Rejected: inside a class body, `this` is the Compiled Schema and `await` and `arguments` are errors, so they would change what an argument means.
