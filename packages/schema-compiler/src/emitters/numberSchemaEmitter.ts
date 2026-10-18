// The code a `NumberSchema` compiles to, one static method per method of
// `NumberSchema` it mirrors.
import { ISSUE_CODE, NUMBER_SCHEMA_ISSUE_MESSAGE, type NumberSchema } from '@pvl/schema';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitChecksArgs } from './emitter.js';
import type { EmitterMethodOf, Check } from './emitterTypes.js';
import { emitIssue } from '../issue.js';
import { emitLiteral, js } from './emitterUtils.js';

export class NumberSchemaEmitter extends ChainableSchemaEmitter {
  /** `typeof field0 !== "number" || Number.isNaN(field0)`, reporting `INVALID_TYPE`. */
  public static override _emitBaseCheck({ target: { value, issuePath } }: EmitChecksArgs): Check {
    return {
      failsWhen: js`typeof ${value} !== "number" || Number.isNaN(${value})`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_TYPE,
        NUMBER_SCHEMA_ISSUE_MESSAGE._checkType(),
        issuePath,
      ),
    };
  }

  /** `.min(0)` → `field0 < 0`, reporting `TOO_SMALL`. */
  public static readonly min: EmitterMethodOf<NumberSchema['min']> = ({
    target: { value, issuePath },
    args: [minValue, options],
  }) => ({
    failsWhen: js`${value} < ${emitLiteral(minValue)}`,
    issue: emitIssue(
      ISSUE_CODE.TOO_SMALL,
      options?.message ?? NUMBER_SCHEMA_ISSUE_MESSAGE.min(minValue),
      issuePath,
    ),
  });

  /** `.max(9)` → `field0 > 9`, reporting `TOO_BIG`. */
  public static readonly max: EmitterMethodOf<NumberSchema['max']> = ({
    target: { value, issuePath },
    args: [maxValue, options],
  }) => ({
    failsWhen: js`${value} > ${emitLiteral(maxValue)}`,
    issue: emitIssue(
      ISSUE_CODE.TOO_BIG,
      options?.message ?? NUMBER_SCHEMA_ISSUE_MESSAGE.max(maxValue),
      issuePath,
    ),
  });

  /** `.int()` → `!Number.isInteger(field0)`, reporting `NOT_INTEGER`. */
  public static readonly int: EmitterMethodOf<NumberSchema['int']> = ({
    target: { value, issuePath },
    args: [options],
  }) => ({
    failsWhen: js`!Number.isInteger(${value})`,
    issue: emitIssue(
      ISSUE_CODE.NOT_INTEGER,
      options?.message ?? NUMBER_SCHEMA_ISSUE_MESSAGE.int(),
      issuePath,
    ),
  });
}
