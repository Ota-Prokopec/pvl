# TypeScript

How to write TypeScript in this repo. `pnpm lint` enforces the mechanical rules, and its messages say what to do; this file holds the judgment calls. Enums and constants have their own file: [enums-and-constants.md](../specification/enums-and-constants.md).

## Naming types

A type's suffix says its role:

- **`Args`**: a function's parameters, wrapped into one descriptive object type.
- **`Options`**: a class's constructor or initialization options.
- **`Payload`**: a complex return type.

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

## Using types

- **Export a function's or class's parameter and return types** alongside it.
- **Annotate a variable with the repo's existing type for its value.** When a type anywhere in the repo describes what the variable holds, write `const scope: ScanScope = {…}`, not `const scope = {…}`, so the compiler checks the value against that type at the declaration.
- **Narrow with type guards and type predicates**, starting from `unknown` where a type is genuinely unknown, so the compiler checks the narrowing an assertion would only claim.

```typescript
type Admin = { role: 'admin' };
type Guest = { role: 'guest' };

const isAdmin = (user: Admin | Guest): user is Admin => {
  return user.role === 'admin';
};
```

## Barrels

A module whose exports aren't public API (e.g. `src/modifiers.ts` in `@pvl/schema`) stays out of its package's barrel, and the barrel names it in a comment saying why. Every other module is exported through the barrel.
