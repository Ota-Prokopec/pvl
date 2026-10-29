// The repo's shared type utilities, kept in this one file with no barrel:
// tsup's declaration bundler (`dts.resolve`) inlines it into `@pcvl/*`'s
// declarations, but can't follow a `.js`-suffixed relative re-export to its
// `.ts` source (ADR-0048).

// Any function, as a parameter type accepting one: its parameters are
// `never[]`, which every function's parameters accept, where `any[]` would
// turn off checking and `unknown[]` would reject a function taking a string.
export type AnyFunction = (...args: never[]) => unknown;

// `ReadonlyArray` rather than `any[]`: a `const`-inferred array source such
// as `pvl.enum(['A', 'B'])`'s is a readonly tuple, which `any[]` doesn't match.
export type ValueOfEnum<T> = T extends ReadonlyArray<unknown> ? T[number] : T[keyof T];
