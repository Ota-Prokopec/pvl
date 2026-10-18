// The code a `BigintSchema` compiles to, one static method per method of
// `BigintSchema` it mirrors.
import { BIGINT_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, type BigintSchema } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitChecksArgs } from './emitter.js';
import type { EmitterMethodOf, Check } from './emitterTypes.js';
import { emitIssue } from '../issue.js';
import { emitLiteral, js } from './emitterUtils.js';

export class BigintSchemaEmitter extends ChainableSchemaEmitter {
  /** `typeof field0 !== "bigint"`, reporting `INVALID_TYPE`. */
  public static override _emitBaseCheck({ target: { value, issuePath } }: EmitChecksArgs): Check {
    return {
      failsWhen: js`typeof ${value} !== "bigint"`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_TYPE,
        BIGINT_SCHEMA_ISSUE_MESSAGE._checkType(),
        issuePath,
      ),
    };
  }

  /** `.min(0n)` → `field0 < 0n`, reporting `TOO_SMALL`. */
  public static readonly min: EmitterMethodOf<BigintSchema['min']> = ({
    target: { value, issuePath },
    args: [minValue, options],
  }) => ({
    failsWhen: js`${value} < ${emitLiteral(minValue)}`,
    issue: emitIssue(
      ISSUE_CODE.TOO_SMALL,
      options?.message ?? BIGINT_SCHEMA_ISSUE_MESSAGE.min(minValue),
      issuePath,
    ),
  });

  /** `.max(9n)` → `field0 > 9n`, reporting `TOO_BIG`. */
  public static readonly max: EmitterMethodOf<BigintSchema['max']> = ({
    target: { value, issuePath },
    args: [maxValue, options],
  }) => ({
    failsWhen: js`${value} > ${emitLiteral(maxValue)}`,
    issue: emitIssue(
      ISSUE_CODE.TOO_BIG,
      options?.message ?? BIGINT_SCHEMA_ISSUE_MESSAGE.max(maxValue),
      issuePath,
    ),
  });
}
