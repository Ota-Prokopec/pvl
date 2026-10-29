// The code the Shared Modifiers held in `ChainableSchemaEmitter`'s tables
// compile to: `.optional()` and `.nullable()`, each writing the condition
// under which a value short-circuits, since a value it accepts skips every
// later check, `.refine()`, which calls the user's own predicate, and
// `.transform()`, which calls the user's own function.
import {
  ISSUE_CODE,
  replaceEmptyIssueMessage,
  type ChainableInterpretedSchema,
} from '@pcvl/schema';
import { emitConstraintIssue } from '../../issue/utils.js';
import type { EmitterMethodOf } from '../types/methodTables.js';
import type { EmittedPreModifierStep } from '../types/schemaParts.js';
import { emitFunctionCall } from './arguments.js';
import { emitCheck, emitShortCircuitCondition, emitTransform } from './emittedText.js';
import { js } from './js.js';

/** `.optional()` → `field0 === undefined`, which short-circuits. */
export const optional: EmitterMethodOf<
  ChainableInterpretedSchema['optional'],
  EmittedPreModifierStep
> = ({ target: { value } }) => ({
  shortCircuitCondition: emitShortCircuitCondition({ acceptsWhen: js`${value} === undefined` }),
});

/** `.nullable()` → `field0 === null`, which short-circuits. */
export const nullable: EmitterMethodOf<
  ChainableInterpretedSchema['nullable'],
  EmittedPreModifierStep
> = ({ target: { value } }) => ({
  shortCircuitCondition: emitShortCircuitCondition({ acceptsWhen: js`${value} === null` }),
});

/**
 * `.refine(isOk)` → `!this.arg0.call(undefined, field0 as never)`, reporting
 * `CUSTOM`, whose default message is the one `@pcvl/schema`'s `Issue` gives an
 * Issue reported without one.
 */
export const refine: EmitterMethodOf<ChainableInterpretedSchema['refine']> = ({
  target: { value, issuePath },
  args: [predicate, options],
}) => ({
  check: emitCheck({
    failsWhen: `!${emitFunctionCall(predicate, value)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.CUSTOM,
      path: issuePath,
      options,
      defaultMessage: JSON.stringify(replaceEmptyIssueMessage(undefined)),
    }),
  }),
});

/**
 * `.transform(fn)` → `field0 = this.arg0.call(undefined, field0 as never);`,
 * at the Schema's own value (`schemaTarget`), which a composite's output
 * has been handed on to by the time it runs.
 */
export const transform: EmitterMethodOf<ChainableInterpretedSchema['transform']> = ({
  schemaTarget: { value },
  args: [fn],
}) => ({
  transform: emitTransform({ statement: js`${value} = ${emitFunctionCall(fn, value)};` }),
});
