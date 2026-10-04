# TypeScript Best Practices for Coding Agents

The rules coding agents follow when writing TypeScript in this repo. `pnpm lint` enforces the mechanical ones, and its messages say what to do. This file holds only what lint can't check.

## Types

- **`Args` suffix for function arguments**: wrap multiple parameters into one descriptive object type.
- **`Options` suffix for class configurations**: constructor or initialization options.
- **`Payload` suffix for a complex return type.**

```typescript
type RegisterUserArgs = {
  email: string;
  username: string;
};

type LoggerOptions = {
  level: string;
  silent: boolean;
};

class Logger {
  constructor(options: LoggerOptions) {}
}

type CalculateTotalPayload = {
  result: number;
};
```

- **Always export the type when exporting a class or function.**
- **Enable strict mode**: `strict: true`, always, to catch potential null/undefined errors.
- **Where a type is genuinely unknown, use `unknown`** and narrow it with a type guard.
- **Prefer type guards and type predicates** over forcing a type with an assertion.

```typescript
type Admin = { role: 'admin' };
type Guest = { role: 'guest' };

const isAdmin = (user: Admin | Guest): user is Admin => {
  return user.role === 'admin';
};
```

- **Keep types clean and concise**: no deep nesting or unnecessary generics where a simple definition suffices.

## Enums: `as const` objects plus `ValueOfEnum`

Declare a fixed set of related named values as an `as const` object, then derive the value union with `ValueOfEnum`, imported from `@repo/types`, never with a hand-written union. Values match their keys, unless they're externally dictated (e.g. `NODE_ENV`, HTTP status codes).

```typescript
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

`ValueOfEnum` also reads a literal array's elements: `pvl.enum(['A', 'B'])`'s source is a readonly tuple, whose `T[keyof T]` would include `length` and every array method.

Where a constant is a single value rather than part of an enum set, see [`docs/specification/enums-and-constants.md`](../specification/enums-and-constants.md).

## Barrels

A module whose exports aren't part of the package's public API (e.g. `src/modifiers.ts` in `@pvl/schema`) is left out of the barrel on purpose, and the barrel names it in a comment saying why. That is a narrow carve-out, not a licence to leave modules out.
