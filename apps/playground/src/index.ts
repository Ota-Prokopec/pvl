import { str } from '../.pvl/schemas/user.js';

const result = str.validate('ahoj');

if (result.issues === undefined) {
  result.value;
}
