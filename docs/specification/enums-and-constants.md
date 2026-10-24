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

An enum used in one module stays a local `const`. Once it is shared or belongs at the package boundary, it moves, exported, to an `enums.ts` beside the modules that use it, never to a `consts.ts`. An internal-only enum goes in an `enums.ts` the barrel leaves out, so its `export *` doesn't publish it: one inside a directory the barrel leaves out (`src/modifiers/enums.ts` in `@pvl/schema`), or one beside the barrel when the package's public enums sit in an `enums.ts` of their own directory, which the barrel re-exports (`src/enums.ts` in `@pvl/schema-compiler`, whose public ones are in `src/diagnostics/enums.ts`).

`ValueOfEnum` also reads a literal array's elements, which is what `pvl.enum(['A', 'B'])` needs: a readonly tuple's `T[keyof T]` would include `length` and every array method.

## Constants

A **constant** is a single value outside any enum set. A constant used in one module stays a local `const`. It moves to the owning app's or package's `consts.ts`, exported, once it is shared or belongs at the package boundary. A package whose barrel publishes only some of its constants keeps the internal ones in a `consts.ts` the barrel leaves out, as it does an internal-only enum (`src/consts.ts` in `@pvl/schema-compiler`, whose public ones are in `src/config/consts.ts` and `src/diagnostics/consts.ts`).
