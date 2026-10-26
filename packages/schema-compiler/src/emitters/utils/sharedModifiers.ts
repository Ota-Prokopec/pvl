// The code the Shared Modifiers held in `ChainableSchemaEmitter`'s tables
// compile to: `.optional()` and `.nullable()`, each returning the condition
// under which a value short-circuits, since a value it accepts skips every
// later check, and `.refine()`, which calls the user's own predicate.
import { ISSUE_CODE, replaceEmptyIssueMessage, type ChainableInterpretedSchema } from '@pvl/schema';
import { emitConstraintIssue } from '../../issue.js';
import type { EmittedShortCircuitCondition } from '../types/emittedText.js';
import type { EmitterMethodOf } from '../types/methodTables.js';
import { emitFunctionCall } from './arguments.js';
import { emitCheck, emitShortCircuitCondition } from './emittedText.js';
import { js } from './js.js';

/** `.optional()` → `field0 === undefined`, which short-circuits. */
export const optional: EmitterMethodOf<
  ChainableInterpretedSchema['optional'],
  EmittedShortCircuitCondition
> = ({ target: { value } }) =>
  emitShortCircuitCondition({ acceptsWhen: js`${value} === undefined` });

/** `.nullable()` → `field0 === null`, which short-circuits. */
export const nullable: EmitterMethodOf<
  ChainableInterpretedSchema['nullable'],
  EmittedShortCircuitCondition
> = ({ target: { value } }) => emitShortCircuitCondition({ acceptsWhen: js`${value} === null` });

/**
 * `.refine(isOk)` → `!this.arg0.call(undefined, field0 as never)`, reporting
 * `CUSTOM`, whose default message is the one `@pvl/schema`'s `Issue` gives an
 * Issue reported without one.
 */
export const refine: EmitterMethodOf<ChainableInterpretedSchema['refine']> = ({
  target: { value, issuePath },
  args: [predicate, options],
}) =>
  emitCheck({
    failsWhen: `!${emitFunctionCall(predicate, value)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.CUSTOM,
      path: issuePath,
      options,
      defaultMessage: JSON.stringify(replaceEmptyIssueMessage(undefined)),
    }),
  });
