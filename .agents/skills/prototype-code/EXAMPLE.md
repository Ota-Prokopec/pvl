# Example run

One run of `prototype-code`, for the question "Should `createUser()` take positional arguments or an options object?" with the axis **parameter shape**. `src/users/` already exists (it holds `db.ts`), so the variants sit there, where `createUser()` will live.

## A variant file

`src/users/options-object.prototype.ts`:

```ts
/*
 * PROTOTYPE, delete me
 * Question: Should `createUser()` take positional arguments or an options object?
 * Approach: one options object, optional fields defaulted inside.
 * Pros: call sites name every argument; adding a field breaks no caller.
 * Cons: one more type to export; required and optional fields share one bag.
 */
import { db } from './db.ts';
// @ts-expect-error -- prototype: module not implemented yet
import type { Role } from './role.ts';

interface CreateUserOptions {
  email: string;
  name: string;
  role?: Role;
  sendWelcomeEmail?: boolean;
}

export const createUser = async ({
  email,
  name,
  role = 'member',
  sendWelcomeEmail = true,
}: CreateUserOptions) => {
  const user = await db.users.insert({ email, name, role });
  if (sendWelcomeEmail) await db.outbox.enqueue({ kind: 'welcome', userId: user.id });
  return user;
};

// Call site
await createUser({ email: 'ada@example.com', name: 'Ada', sendWelcomeEmail: false });
```

`src/users/positional-args.prototype.ts` has the same header (only the approach, pros and cons change), the same behaviour behind `createUser(email, name, role = 'member', sendWelcomeEmail = true)`, and its own call site: `await createUser('ada@example.com', 'Ada', undefined, false);`.

## The comparison table

| Variant         | File                                     | Pros                                                       | Cons                                                                     |
| --------------- | ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| options-object  | `src/users/options-object.prototype.ts`  | Named arguments at the call site; new fields break no one. | Extra exported type; required and optional fields mixed in one object.   |
| positional-args | `src/users/positional-args.prototype.ts` | No extra type; the shortest call for the common case.      | `undefined` placeholders to reach a late option; order is easy to swap.  |
