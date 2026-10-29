// Imports both packages as ESM and validates through the interpreted and compiled paths.
import { runCompilation } from '@pcvl/compiler';
import { pvl } from '@pcvl/schema';
import { user } from '../.pvl/schemas/user.js';
if (typeof runCompilation !== 'function') throw new Error('ESM: no runCompilation');
if (pvl.string().validate('a').issues !== undefined) throw new Error('ESM: interpreted');
if (user.validate({ name: 'a' }).issues !== undefined) throw new Error('ESM: compiled');
