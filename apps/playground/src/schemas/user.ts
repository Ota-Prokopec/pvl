// The one Schema this playground compiles. `pvl compile` mirrors it into `.pvl/`.
import { pvl } from '@pcvl/schema';

export const str = pvl.compile(pvl.object({ tags: pvl.array(pvl.string()).standalone() }));
