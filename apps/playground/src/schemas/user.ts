// The one Schema this playground compiles. `pvl compile` mirrors it into `.pvl/`.
import { pvl } from '@pvl/schema';

export const str = pvl.string().transform((value) => `"${value}"`);
