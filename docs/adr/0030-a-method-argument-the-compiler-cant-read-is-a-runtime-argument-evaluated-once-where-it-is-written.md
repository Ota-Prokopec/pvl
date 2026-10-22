# A method argument the compiler can't read is a Runtime Argument, evaluated once where it is written

**A method's argument that doesn't read statically is a Runtime Argument rather than an error.** That covers a `const`, a parameter, a `let`, an import, a call, a property read and an operator, `++count` included. The compiler copies the argument as written into the Compiled Schema, which evaluates it. Before, it was `COMPILE_ARGUMENT_UNRESOLVABLE`, so a Schema built from a value only known at runtime couldn't be compiled at all:

```ts
export const getUser = (maxLength: number) => pvl.compile(pvl.string().max(maxLength));
```

Only a method's arguments can be Runtime Arguments: a Constraint's value (`.max(maxLength)`) and Issue options, whole or with a value inside (`.min(1, options)`, `{ message }`). A factory's argument stays static, as before (`pvl.literal(…)`, `pvl.enum(…)`, an object's shape, an array's element, a union's members). It decides the Schema's types, which the compiler spells out without checking types ([ADR-0024](./0024-the-compiler-checks-syntax-not-types.md)), or the structure it inlines ([ADR-0023](./0023-compiled-schemas-inline-nested-schemas-and-mirror-schema-methods.md)).

**Only a literal written in place is written into the checks as a literal:** `3`, `-1`, `!0`, `+'2'`, `{ message: 'too short' }`. It names nothing, and an object written there is one nothing else holds, so nothing can change it later. A method's argument never follows a `const`, so `.max(MAX)` with a top-level `const MAX = 3` is a Runtime Argument like any other name. The compiler still follows a `const` holding the Schema `pvl.compile()` wraps, or a factory's argument, as those decide the structure and types. Following one for a method's argument would read its value at compile time, and the Compiled Schema would disagree with the interpreted path three ways:

- **An object it holds can change after the Schema is built.** `.max(3, OPTIONS)` with `const OPTIONS = { message: 'too long' }`, then `OPTIONS.message = 'way too long'`: the interpreted Schema reads `options?.message` when it builds the Issue, so it reports the new message, and a message copied in reports the old one.
- **Declaration order is ignored.** The compiler binds the name to the `const` wherever it is declared, so `pvl.compile(pvl.string().max(MAX))` written above `const MAX = 3` compiled to `3`, while the interpreted module throws a ReferenceError as it loads.
- **The same source compiles two ways.** A top-level `const MAX` came out as `3`, the same `const` inside a function as `this.arg0`.

All it bought was a literal in the check, which measured no faster (Consequences), and a default message built once, which the constructor now builds (below).

**A Runtime Argument is evaluated once, where it is written, as the interpreted path evaluates it.** An interpreted Schema evaluates `maxLength` when `pvl.string().max(maxLength)` runs and keeps the value, so a later change to the variable doesn't reach it, and `.max(getMax())` calls `getMax()` once. A Compiled Schema whose checks read the variable through a closure would disagree on both: `for (var i = 1; i <= 3; i++) pvl.compile(pvl.string().max(i))` would give three Schemas of `max 4`. So the class expression ([ADR-0029](./0029-a-compiled-schema-is-a-class-expression-implementing-the-schema-type.md)) takes each one through its constructor, the arguments written as they were, in source order, and its checks read the stored value (`this.arg0`):

```ts
export const getUser = (maxLength: number) => (new (class PvlCompiledSchema0 implements PvlSchema<string, string> {
  declare readonly [PVL_SCHEMA_BRAND]: true;

  readonly arg0Message: string;

  constructor(readonly arg0: number) {
    this.arg0Message = `String must contain at most ${arg0} character(s)`;
  }
  …
      if (value.length > this.arg0) { issues.push({ code: "TOO_BIG", message: this.arg0Message, … }); }
  …
})(maxLength) as PvlSchema<string, string>);
```

The constructor call sits where the `pvl.compile(...)` call was. So the arguments run at the same moment and in the same order as the interpreted path's, and in the same scope: `this.limit`, `await getLimit()` and a parameter that shadows a top-level `const` mean what they meant there. Each parameter is typed from the method it is passed to, as its Emitter spells it (`parameterTypes`).

**One written in a top-level `const` the call follows is hoisted.** In `const base = pvl.string().max(getMax()); export const getUser = () => pvl.compile(base)`, passing `getMax()` at the call would run it on every `getUser()` call, and once more for the interpreted `base` the mirror still holds. A name copied there could also bind to something else, which is why a plain name such as `MAX` is hoisted too (`const pvlArg0 = MAX;`): see the closure under Considered options. So the mirror rewrites the declaration: `const pvlArg0 = getMax();` goes right before its declarator, which then reads `pvlArg0`, as does every call it reaches. A declarator after the first in its statement is split off into a statement of its own, so the argument still runs after the declarators before it. The name `pvlArg<n>` is one the module doesn't use, so nothing shadows it.

**A default message that names a Runtime Argument is built once, in the constructor**, into a field of its own (`arg0Message`), which the checks read. It is a template literal around the literal text of `<SCHEMA>_SCHEMA_ISSUE_MESSAGE`, so it writes the value as the interpreted path's own template literal does. Each Emitter lists the messages that name a method's first argument in `argumentMessages`, beside `parameterTypes`, and the constructor builds one for each Runtime Argument passed there, even when a custom message replaces it. Built with `+` on every Issue instead, it made a failing validation about 40% slower (Consequences). `+` also calls `valueOf` before `toString`, while a template literal calls `toString`, so the two disagreed for an object argument whose methods differ. Built once, an argument whose `toString` answers differently on each call is read once, not once per Issue. Only code that doesn't type-check can pass such an object. `.strict()`'s message names the key, which differs per Issue, so it is still built as the Issue is, as a template literal too. Issue options passed as a Runtime Argument are read when the Issue is built, as the interpreted path reads them: `(this.arg1?.message ?? this.arg0Message) || "Invalid type"`.

## Consequences

- Amends [ADR-0025](./0025-static-reading-never-evaluates-an-assignment.md): the compiler still never evaluates an assignment, but `++count` as a method's argument is now a Runtime Argument. It runs once at runtime, side effect included, as in the interpreted path, so the reason it was rejected no longer applies.
- Narrows [ADR-0002](./0002-static-ast-compilation-via-ts-morph.md)'s trade-off, that only statically resolvable Schemas compile, to a Schema's structure and types.
- `COMPILE_ARGUMENT_UNRESOLVABLE` now covers a factory's argument the compiler can't read, and a spread method argument (`.max(...limits)`, `{ ...options }` written in place), which has no fixed position to pass it at.
- The mirror rewrites a top-level `const` declaration outside any `pvl.compile(...)` call when it holds a hoisted argument. Until now it rewrote only the calls and the module specifiers.
- A Constraint checks against a property read (`this.arg0`) rather than a literal, which costs nothing measurable. Each variant was run in its own Node v24.21.0 process, 2×10⁷ calls each. A passing string took 54 ms whether the check read `3`, `this.arg0` or `MAX` through the closure. A failing one took about 345 ms with the literal, 485 ms when its default message was built with `+` per Issue, and 348 ms once the constructor built it.
- `COMPILE_ARGUMENT_CYCLE` no longer covers a method's argument. One naming its own `const` (`const s = pvl.string().max(s)`) is a Runtime Argument, which throws a ReferenceError as the module loads, as the interpreted path does.
- A message built around a value assumes the message writes the value as it is. One that formats it would come out wrong, which the differential test would catch.

## Considered options

- **Read the variable through the class expression's closure.** Shorter. Rejected: it reads the value at every call, so it disagrees with the interpreted path whenever the variable changes or the argument is a call, unless the compiler rejects every such argument, which needs the variable tracking ADR-0025 avoids. Even a `const`, which never changes, would be read wrongly. The class expression sits where the call is, so a name in a `const` the call follows could bind to something else there:

  ```ts
  const MAX = 3;
  const base = pvl.string().max(MAX);
  export const make = (MAX: number) => pvl.compile(base);
  ```

  Inside `make`, `MAX` is the parameter, while the interpreted `base` has `max 3`. And `MAX` read only when a value is validated would no longer throw as the module loads when `const MAX` is declared below the call, as the interpreted path does.

- **Keep following a `const` for a method's argument, or only one holding a primitive.** Rejected: following one disagrees with the interpreted path in the three ways above, for a literal in the check that measured no faster. Only a primitive would remove the changed options object, but keep the other two.
- **Pass a name as written when it binds to the same declaration at the call, rather than hoisting it.** Rejected: it saves one line of output at the cost of binding a method's argument's names again, and one rule hoists every Runtime Argument in a followed `const`.
- **Build a default message naming a Runtime Argument each time its Issue is reported.** Rejected: it made a failing validation about 40% slower, and its `+` wrote an object argument differently from the interpreted path's template literal.
- **Only names (parameters, `let`s, imports), not calls or operators.** Rejected: evaluated once where written, any expression behaves as in the interpreted path, so a narrower rule would only reject code that works.
- **Copy an argument in a followed `const` to the call, or reject it.** Rejected: copying runs it at a different time, more often, and maybe against a different binding, and rejecting leaves such a Schema uncompilable wherever it is followed.
- **Field initializers in the class expression instead of constructor parameters**, which would need no type spelled. Rejected: inside a class body, `this` is the Compiled Schema and `await` and `arguments` are errors, so they would change what an argument means.
