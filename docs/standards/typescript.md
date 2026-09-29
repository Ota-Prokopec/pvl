# TypeScript Best Practices for Coding Agents

This guide outlines the core rules and standards that coding agents must follow when writing TypeScript code to ensure optimal type safety, maintainability, and clarity.

## Core Rules

- **Always use types, never use interfaces**
  Use the `type` keyword for all object definitions and contract declarations to ensure a unified approach and leverage advanced type features.

```typescript
type User = {
  id: string;
  name: string;
};
```

- **Use Args suffix for function arguments**
  Name function argument types using the `Args` suffix, wrapping multiple parameters into a single descriptive object.

```typescript
type RegisterUserArgs = {
  email: string;
  username: string;
};

const registerUser = (args: RegisterUserArgs) => {
  // implementation
};
```

- **Use Options suffix for class configurations**
  Name class constructor configurations or initialization options using the `Options` suffix.

```typescript
type LoggerOptions = {
  level: string;
  silent: boolean;
};

class Logger {
  constructor(options: LoggerOptions) {}
}
```

- **Always export type when exporting class or function**

- **Always use arrow functions**

```typescript
const calculateTotal = (args: CalculateTotalArgs): number => {
  return args.count * 2;
};
```

- **Enable strict mode**
  Always ensure `strict: true` is enabled in the configuration to catch potential null or undefined errors.

- **Avoid the any type**
  Do not use `any` under any circumstances. If a type is genuinely unknown, use `unknown` and implement type guards.

- **Define explicit return types**
  Always declare the return types of functions and methods explicitly to make the API boundaries clear.

```typescript
const calculateTotal = (args: CalculateTotalArgs): number => {
  return args.count * 2;
};
```

- **Define payload type for complex return type**

```typescript
type CalculateTotalPayload = {
  result: number;
};

const calculateTotal = (args: CalculateTotalArgs): CalculateTotalPayload => {
  return {
    result: args.count * 2,
  };
};
```

- **Prefer type guards and type predicates**
  Use type predicates to narrow down types safely instead of forcing types via type assertions.

```typescript
type Admin = { role: 'admin' };
type Guest = { role: 'guest' };

const isAdmin = (user: Admin | Guest): user is Admin => {
  return user.role === 'admin';
};
```

- **Use const assertions for literal types**
  Use `as const` to create immutable literal types instead of standard enums.

```typescript
const Roles = {
  Admin: 'admin',
  User: 'user',
} as const;
```

- **Use const assertions for enums — never use the `enum` keyword**
  Never use the TypeScript `enum` keyword. Instead, use `as const` objects where both the keys and values are UPPER_SNAKE_CASE. When values are externally dictated (e.g. `NODE_ENV`, HTTP status codes), they may differ from the key format. Always derive the value union type using the `ValueOfEnum` utility type.

```typescript
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
```

- **Keep types clean and concise**
  Avoid over-engineering types with deep nesting or unnecessary generics when a simple type definition suffices.

- **Always use ES modules**

- **Never use "as" during importing if it is not required**

- **Use ValueOfEnum for extracting enum value types**
  Always use the `ValueOfEnum` utility type, imported from `@repo/types`, to extract the union of values from a `const` enum object. Never use `typeof X[keyof typeof X]` inline, a manual union, or a locally re-declared copy of `ValueOfEnum` — every package that needs it takes `@repo/types` as a `workspace:*` dependency.

```typescript
// Correct
import type { ValueOfEnum } from '@repo/types';

const ROLES = {
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;

type Role = ValueOfEnum<typeof ROLES>; // 'ADMIN' | 'USER'

// Incorrect — inline typeof/keyof
type Role = (typeof ROLES)[keyof typeof ROLES];

// Incorrect — local re-declaration instead of importing from @repo/types
type ValueOfEnum<T> = T[keyof T];
```

- **Barrel files always use `export * from '...'`**
  In `index.ts` barrel files, re-export every sibling module with `export * from './module.js';`. Never cherry-pick named or type-only exports (`export { x } from ...`, `export type { X } from ...`) in a barrel — a source module either belongs in the barrel or it doesn't. This keeps barrels mechanically regenerable (see `pnpm barrels`) and consistent regardless of what a module happens to export today.

  **Exception: deliberately internal-only modules.** A sibling module whose exports are not part of the package's public API (e.g. `schemas/sharedModifiers.ts` in `@pvl/schema` — internal modifier-decision logic, not something a consumer of the package imports) is omitted from the barrel on purpose. Mark the omission with a one-line comment at the barrel's usual alphabetical slot for that module, so its absence reads as intentional rather than something a future agent should "fix" by adding it back. This is a narrow, explicitly-called-out carve-out, not a general license to cherry-pick — every other sibling module still belongs in the barrel unconditionally.

```typescript
// Correct
export * from './Exception.js';
export * from './HttpException.js';

// Incorrect
export { Exception } from './Exception.js';
export type { AnyException } from './Exception.js';
```

- **Define env schema using createEnv from @repo/utils package**

```typescript
import { createEnv } from '@repo/utils';

export const env = createEnv({
  schema: {
    NODE_ENV: Schema.Enums(...),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```
