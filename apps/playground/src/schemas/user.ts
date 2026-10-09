// The one Schema this playground compiles. `pvl compile` mirrors it into `.pvl/`.
import { pvl } from '@pvl/schema';

export const user = pvl.compile(
  pvl.object({
    name: pvl.string().min(3),
    age: pvl.number().int().min(0),
  }),
);
