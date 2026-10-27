# Enums and constants

How to declare a fixed set of named values (an **enum**) or a single shared value (a **constant**). `pnpm lint` enforces their declaration shape and naming; this file holds the judgment calls.

## Enums

Declare an enum as an `as const` object, and derive its value union with `ValueOfEnum` from `@repo/types`. Each value matches its key, unless it is externally dictated (`NODE_ENV`, HTTP status codes).

```ts
import type { ValueOfEnum } from '@repo/types';

export const SYSTEM_ROLE = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const;

export type SystemRole = ValueOfEnum<typeof SYSTEM_ROLE>;

// Externally dictated values may differ from the key format:
export const NODE_ENV = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
} as const;

export type NodeEnv = ValueOfEnum<typeof NODE_ENV>;
```

Every enum, even one only a single module uses, is exported from its directory's `enums.ts`, with its value union under it, never declared in a module or in a `consts.ts`. [typescript.md](../standards/typescript.md#where-types-enums-and-constants-live) says which directory. An internal-only enum goes in an `enums.ts` the barrel leaves out, so its `export *` doesn't publish it: one inside a directory the barrel leaves out (`src/modifiers/enums.ts` in `@pvl/schema`), or one beside the barrel when the package's public enums sit in an `enums.ts` of their own directory, which the barrel re-exports (`src/enums.ts` in `@pvl/schema-compiler`, whose public ones are in `src/diagnostics/enums.ts`).

`ValueOfEnum` also reads a literal array's elements, which is what `pvl.enum(['A', 'B'])` needs: a readonly tuple's `T[keyof T]` would include `length` and every array method.

## Constants

A **constant** is a single value outside any enum set. Every constant, even one only a single module uses, is exported from its directory's `consts.ts`, never declared in a module. [typescript.md](../standards/typescript.md#where-types-enums-and-constants-live) says which directory. A package whose barrel publishes only some of its constants keeps the internal ones in a `consts.ts` the barrel leaves out, as it does an internal-only enum (`src/consts/` in `@pvl/schema-compiler`, whose public ones are in `src/config/consts.ts` and `src/diagnostics/consts.ts`).
