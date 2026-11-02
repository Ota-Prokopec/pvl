# `@repo/types`

The home of `ValueOfEnum<T>`, the utility type [`enums-and-constants.md`](../../docs/specification/enums-and-constants.md) has every `as const` enum consumer import rather than re-declare. Types only, with no runtime code. [`@pcvl/schema`](../schema/AGENTS.md) uses it for its internal enums (e.g. `Issue` codes).

It also holds `AnyFunction`, the type a parameter accepting any function is typed by, as `@pcvl/compiler`'s `emitFunctionCall` takes the user's `.refine()` predicate or `.transform()` function.

`ValueOfEnum` has an array branch for `pvl.enum(['A', 'B'])`, whose source is a readonly tuple: `T[keyof T]` on an array would also yield `length` and every array method. It matches `ReadonlyArray`, because a `const`-inferred tuple is readonly and `any[]` wouldn't match it.

## Scope

The package stays narrow. A cross-package type utility belongs here only when it is the single canonical implementation of something the repo's standards require every consumer to share, the role `ValueOfEnum` plays. A type that just wants a central home stays with its user.
