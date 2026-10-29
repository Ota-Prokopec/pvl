// Validates one passing and one failing value against the Compiled Schema and prints both `Result`s. Reruns on every save.
import { user } from '../.pvl/schemas/user.js';

console.dir(user.validate({ name: 'Ada', age: 36 }), { depth: null });
console.dir(user.validate({ name: '', age: 1.5 }), { depth: null });
