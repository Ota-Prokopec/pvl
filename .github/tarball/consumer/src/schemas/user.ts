// The Schema `compile.sh` compiles into `.pvl/`.
import { pvl } from '@pcvl/schema';
export const user = pvl.compile(pvl.object({ name: pvl.string() }));
