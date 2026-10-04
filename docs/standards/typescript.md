# TypeScript Best Practices for Coding Agents

The rules coding agents follow when writing TypeScript in this repo. JavaScript is prohibited.

## Types

- **Always use `type`, never `interface`** — for object definitions and contract declarations alike, so the approach is uniform and advanced type features stay available.

```typescript
type User = {
  id: string;
  name: string;
};
```

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
- **Enable strict mode** — `strict: true`, always, to catch potential null/undefined errors.
- **Avoid `any` entirely.** Where a type is genuinely unknown use `unknown` and implement type guards.
- **Prefer type guards and type predicates** over forcing a type with an assertion.

```typescript
type Admin = { role: 'admin' };
type Guest = { role: 'guest' };

const isAdmin = (user: Admin | Guest): user is Admin => {
  return user.role === 'admin';
};
```

- **Keep types clean and concise** — no deep nesting or unnecessary generics where a simple definition suffices.

## Functions

- **Always use arrow functions**, with an **explicit return type**, so API boundaries stay clear.

```typescript
const calculateTotal = (args: CalculateTotalArgs): number => {
  return args.count * 2;
};
```

## Enums: `as const` objects plus `ValueOfEnum`

**Never use the TypeScript `enum` keyword.** Declare a fixed set of related named values as an `as const` object with UPPER_SNAKE_CASE keys and values, then derive the value union with `ValueOfEnum`, imported from `@repo/types`. Externally dictated values (e.g. `NODE_ENV`, HTTP status codes) may differ from the key format.

Never write `typeof X[keyof typeof X]` inline, a hand-written union, or a local copy of `ValueOfEnum` — every package that needs it takes `@repo/types` as a `workspace:*` dependency.

```typescript
import type { ValueOfEnum } from '@repo/types';

export const SYSTEM_ROLE = {
  OWNER: 'OWNER',
  MEMBER: 'MEMBER',
} as const;

export type SystemRole = ValueOfEnum<typeof SYSTEM_ROLE>;

export const HTTP_STATUS = {
  OK_200: 200,
  NOT_FOUND_404: 404,
} as const;

export type HttpStatus = ValueOfEnum<typeof HTTP_STATUS>;

// Externally dictated values may differ from key format:
export const NODE_ENV = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;

export type NodeEnv = ValueOfEnum<typeof NODE_ENV>;

// `ValueOfEnum` also reads a literal array's elements — `pvl.enum(['A', 'B'])`'s
// source is a readonly tuple, whose `T[keyof T]` would include `length` and
// every array method.

// Incorrect — inline typeof/keyof, or a local re-declaration:
type Role = (typeof SYSTEM_ROLE)[keyof typeof SYSTEM_ROLE];
type ValueOfEnum<T> = T extends ReadonlyArray<unknown> ? T[number] : T[keyof T];
```

Where a constant is a single value rather than part of an enum set, see [`docs/specification/enums-and-constants.md`](../specification/enums-and-constants.md).

## Modules

- **Always use ES modules**, and never `as` in an import unless it is required.
- **Barrel files always use `export * from '...'`.** In an `index.ts` barrel, re-export every sibling with `export * from './module.js';`. Never cherry-pick named or type-only exports (`export { x } from ...`, `export type { X } from ...`) — a source module either belongs in the barrel or it doesn't. This keeps barrels consistent regardless of what a module happens to export today.

  **Exception: deliberately internal-only modules.** A sibling whose exports are not part of the package's public API (e.g. `src/modifiers.ts` in `@pvl/schema` — the internal `Modifier` type and `MODIFIER_TAG`, which no consumer imports by name) is omitted on purpose. Mark the omission with a one-line comment at the barrel's usual alphabetical slot for that module, so its absence reads as intentional rather than as something a future agent should "fix". This is a narrow carve-out, not a general license to cherry-pick.

```typescript
// Correct
export * from './Exception.js';
export * from './HttpException.js';

// Incorrect
export { Exception } from './Exception.js';
export type { AnyException } from './Exception.js';
```
