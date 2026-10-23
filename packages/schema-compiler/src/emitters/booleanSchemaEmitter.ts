// The code a `BooleanSchema` compiles to: its type check, as it has no
// Constraint, and `.coerce()`, held in its `coercions` table.
import { BOOLEAN_SCHEMA_ISSUE_MESSAGE, type ChainableInterpretedSchema } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { emitCoerceToBoolean } from './coercions.js';
import type { EmitBaseCheckArgs } from './emitter.js';
import type {
  CoercionTable,
  EmittedCheck,
  EmittedCoercion,
  EmitterMethodOf,
} from './emittersTypes.js';
import { js } from './emitterUtils.js';

/** `.coerce()` → `field0 = Boolean(field0)` for a string, a number or a bigint, as `coerceToBoolean` converts. */
const coerce: EmitterMethodOf<ChainableInterpretedSchema['coerce'], EmittedCoercion> = ({
  target: { value },
}) => emitCoerceToBoolean(value);

export class BooleanSchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly coercions = {
    ...ChainableSchemaEmitter.coercions,
    coerce,
  } satisfies CoercionTable;

  /** `typeof field0 !== "boolean"`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return this.emitTypeCheck({
      failsWhen: js`typeof ${value} !== "boolean"`,
      message: BOOLEAN_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }
}
