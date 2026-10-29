// Requires both packages as CJS.
import { runCompilation } from '@pcvl/compiler';
import { pvl } from '@pcvl/schema';
if (typeof runCompilation !== 'function') throw new Error('CJS: no runCompilation');
if (pvl.string().validate('a').issues !== undefined) throw new Error('CJS: interpreted');
