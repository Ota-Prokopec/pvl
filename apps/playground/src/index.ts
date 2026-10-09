// Validates a passing and a failing value against the Compiled Schema that
// `pvl compile` emitted into `.pvl/`, and prints the result.
import { inspect } from 'node:util';
import { user } from '../.pvl/schemas/user.js';

for (const value of [
  { name: 'Alice', age: 30 },
  { name: 'Al', age: -1.5 },
]) {
  console.log(inspect(value, { breakLength: Infinity }));
  console.log('  ->', inspect(user.validate(value), { depth: null, breakLength: Infinity }));
}
