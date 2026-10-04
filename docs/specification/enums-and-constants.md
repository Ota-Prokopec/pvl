# Enums and Constants

`pnpm lint` enforces how enums and constants are declared and named. This file holds only the judgment calls.

**Enums** are any fixed set of related named values, declared as `as const` objects following [`docs/standards/typescript.md`](../standards/typescript.md).

```ts
export const SYSTEM_ROLE = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const;

export type SystemRole = ValueOfEnum<typeof SYSTEM_ROLE>;
```

**True constants** are single values that aren't part of an enum set. A constant used only within one module stays a non-exported local `const`. Export it, from the owning app's or package's `consts.ts`, only when it's shared or logically belongs at the package/app boundary.
