// Any function, as a parameter type accepting one: its parameters are
// `never[]`, which every function's parameters accept, where `any[]` would
// turn off checking and `unknown[]` would reject a function taking a string.
export type AnyFunction = (...args: never[]) => unknown;
