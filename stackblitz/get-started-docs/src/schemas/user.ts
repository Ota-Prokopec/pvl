// The getting-started page's `user` Schema, marked to compile. Edit it and save: `pvl compile` mirrors it into `.pvl/schemas/user.ts`.
import { pvl } from '@pcvl/schema';

export const user = pvl.compile(
  pvl.object({
    name: pvl.string().min(1),
    age: pvl.number().int().min(0),
    nickname: pvl.string().optional(),
  }),
);
