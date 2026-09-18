# Enums and Constants

**Enums** — any fixed set of related named values — must be declared as `as const` objects following the pattern in [`docs/standards/typescript.md`](../standards/typescript.md). Never use the TypeScript `enum` keyword.

```ts
export const SYSTEM_ROLE = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const;

export type SystemRole = ValueOfEnum<typeof SYSTEM_ROLE>;
```

**True constants** (single values that are not part of an enum set) must be placed in a `consts.ts` file scoped to the app or package that owns them. Export them as `UPPER_SNAKE_CASE` named exports.

Do not export constants from middleware, route, or utility files. If a constant is only used within one module, it can remain as a non-exported local `const`; only move it to `consts.ts` when it is shared or logically belongs at the package/app boundary.
