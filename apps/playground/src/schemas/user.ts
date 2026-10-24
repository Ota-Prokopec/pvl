// The one Schema this playground compiles. `pvl compile` mirrors it into `.pvl/`.
import { pvl } from '@pvl/schema';

export const str = pvl.compile(
  pvl.object({ key: pvl.object({ key: pvl.array(pvl.string()).standalone() }).standalone() }),
);
