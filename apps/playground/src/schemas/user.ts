// The one Schema this playground compiles. `pvl compile` mirrors it into `.pvl/`.
import { pvl } from '@pvl/schema';

export const str = pvl.compile(pvl.object({ tags: pvl.array(pvl.string()).standalone() }));

pvl.array(pvl.string()).element;
pvl.object({ key: pvl.string() }).shape;
