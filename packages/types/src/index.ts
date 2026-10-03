// `ReadonlyArray` rather than `any[]`: a `const`-inferred array source such
// as `pvl.enum(['A', 'B'])`'s is a readonly tuple, which `any[]` doesn't match.
export type ValueOfEnum<T> = T extends ReadonlyArray<unknown> ? T[number] : T[keyof T];
