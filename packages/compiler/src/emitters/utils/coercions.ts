// The code `.coerce()` compiles to on each primitive, as `@pcvl/schema`'s own
// `coerceToString`, `coerceToNumber`, `coerceToBoolean` and `coerceToBigint`
// convert: statements replacing the value before its type check, inlined
// rather than imported, as the emitted code imports nothing at runtime. A
// primitive's emitter and a literal's, which coerces as the primitive of its
// value does, write them.
import type { EmittedCoercion } from '../types/emittedText.js';
import { emitCoercion } from './emittedText.js';
import { composeBlock, js } from './js.js';

/**
 * `pvl.string().coerce()`'s conversion: every value becomes its `String()`
 * form.
 *
 * ```ts
 * emitCoerceToString('field0') // 'field0 = String(field0);'
 * ```
 */
export const emitCoerceToString = (value: string): EmittedCoercion =>
  emitCoercion({ statement: js`${value} = String(${value});` });

/**
 * `pvl.number().coerce()`'s conversion: a string or a boolean becomes its
 * `Number()` form, and any other value is left as it is.
 *
 * ```ts
 * emitCoerceToNumber('field0')
 * // 'if (typeof field0 === "string" || typeof field0 === "boolean") {\n  field0 = Number(field0);\n}'
 * ```
 */
export const emitCoerceToNumber = (value: string): EmittedCoercion =>
  emitCoercion({
    statement: composeBlock({
      head: js`if (typeof ${value} === "string" || typeof ${value} === "boolean")`,
      body: js`${value} = Number(${value});`,
    }),
  });

/**
 * `pvl.boolean().coerce()`'s conversion: a string, a number or a bigint
 * becomes its `Boolean()` form, and any other value is left as it is.
 *
 * ```ts
 * emitCoerceToBoolean('field0')
 * // 'if (typeof field0 === "string" || typeof field0 === "number" || typeof field0 === "bigint") {\n  field0 = Boolean(field0);\n}'
 * ```
 */
export const emitCoerceToBoolean = (value: string): EmittedCoercion =>
  emitCoercion({
    statement: composeBlock({
      head: js`if (typeof ${value} === "string" || typeof ${value} === "number" || typeof ${value} === "bigint")`,
      body: js`${value} = Boolean(${value});`,
    }),
  });

/**
 * `pvl.bigint().coerce()`'s conversion: a string or a number goes through
 * `BigInt()`, and one it refuses is left as it is for the base check to
 * reject, as is any other value.
 *
 * ```ts
 * emitCoerceToBigint('field0')
 * // 'if (typeof field0 === "string" || typeof field0 === "number") {\n  try {\n    field0 = BigInt(field0);\n  } catch {\n    …\n  }\n}'
 * ```
 */
export const emitCoerceToBigint = (value: string): EmittedCoercion =>
  emitCoercion({
    statement: composeBlock({
      head: js`if (typeof ${value} === "string" || typeof ${value} === "number")`,
      body: js`try {
        ${value} = BigInt(${value});
      } catch {
        // Not a bigint: the base check rejects the value as it is.
      }`,
    }),
  });
