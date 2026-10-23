// The code the Shared Modifiers of `ChainableInterpretedSchema` compile to:
// `.optional()` and `.nullable()`, held in its `shortCircuitConditions`
// table, each returning the condition under which a value short-circuits,
// since a value it accepts skips every later check; `.coerce()`'s identity,
// held in its `coercions` table, which a primitive's emitter overrides; and
// `.refine()`, held in its `postModifierChecks` table, and `.transform()`,
// held in its `transforms` table, which call the user's own functions. Every schema's emitter extends it, as every schema
// extends `ChainableInterpretedSchema`.
import { ISSUE_CODE, replaceEmptyIssueMessage, type ChainableInterpretedSchema } from '@pvl/schema';
import { ISSUE_OPTIONS_TYPE } from '../consts.js';
import { MODIFIER_NAME } from '../enums.js';
import { emitConstraintIssue } from '../issue.js';
import type { SchemaModifierCall } from '../schemas/schemaTypes.js';
import { Emitter, type SpellParameterTypesArgs, type SpellTypesArgs } from './emitter.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import type {
  CoercionTable,
  EmittedCoercion,
  EmittedShortCircuitCondition,
  EmittedTransform,
  EmitterMethodOf,
  PostModifierCheckTable,
  ShortCircuitConditionTable,
  TransformTable,
} from './emittersTypes.js';
import {
  emitCheck,
  emitCoercion,
  emitFunctionCall,
  emitShortCircuitCondition,
  emitTransform,
  js,
} from './emitterUtils.js';

/**
 * `type` with `| undefined` or `| null` added for each `.optional()` and
 * `.nullable()` in `calls`, in chain order. A `.coerce()` in `calls`
 * widens it to `unknown`, which they then leave as it is, when `type` is
 * an input type: a coerced Schema takes any value.
 *
 * ```ts
 * widenType('string', [nullable(), optional()], { isInput: false })    // 'string | null | undefined'
 * widenType('string', [min(3)], { isInput: false })                    // 'string'
 * widenType('string', [nullable(), coerce(), optional()], { isInput: true }) // 'unknown'
 * ```
 */
const widenType = (
  type: string,
  calls: ReadonlyArray<SchemaModifierCall>,
  { isInput }: { isInput: boolean },
): string => {
  if (isInput && calls.some((call) => call.name === MODIFIER_NAME.COERCE)) {
    return 'unknown';
  }
  return calls.reduce(
    (widened, call) =>
      call.name === MODIFIER_NAME.OPTIONAL
        ? `${widened} | undefined`
        : call.name === MODIFIER_NAME.NULLABLE
          ? `${widened} | null`
          : widened,
    type,
  );
};

/** `.optional()` → `field0 === undefined`, which short-circuits. */
const optional: EmitterMethodOf<
  ChainableInterpretedSchema['optional'],
  EmittedShortCircuitCondition
> = ({ target: { value } }) =>
  emitShortCircuitCondition({ acceptsWhen: js`${value} === undefined` });

/** `.nullable()` → `field0 === null`, which short-circuits. */
const nullable: EmitterMethodOf<
  ChainableInterpretedSchema['nullable'],
  EmittedShortCircuitCondition
> = ({ target: { value } }) => emitShortCircuitCondition({ acceptsWhen: js`${value} === null` });

/**
 * `.coerce()` → nothing: the identity, as `@pvl/schema`'s base
 * `_coerceInput` is, which an object, an array and an enum keep.
 */
const coerce: EmitterMethodOf<ChainableInterpretedSchema['coerce'], EmittedCoercion> = () =>
  emitCoercion({ statement: '' });

/**
 * `.refine(isOk)` → `!this.arg0.call(undefined, field0 as never)`, reporting `CUSTOM`, whose
 * default message is the one `@pvl/schema`'s `Issue` gives an Issue reported
 * without one.
 */
const refine: EmitterMethodOf<ChainableInterpretedSchema['refine']> = ({
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

/**
 * `.transform(fn)` → `field0 = this.arg0.call(undefined, field0 as never);`, which the Frame
 * runs only when nothing failed.
 */
const transform: EmitterMethodOf<ChainableInterpretedSchema['transform'], EmittedTransform> = ({
  target: { value },
  args: [fn],
}) => emitTransform({ statement: js`${value} = ${emitFunctionCall(fn, value)};` });

export class ChainableSchemaEmitter extends Emitter {
  public static override readonly shortCircuitConditions = {
    ...Emitter.shortCircuitConditions,
    optional,
    nullable,
  } satisfies ShortCircuitConditionTable;

  public static override readonly coercions = {
    ...Emitter.coercions,
    coerce,
  } satisfies CoercionTable;

  public static override readonly postModifierChecks = {
    ...Emitter.postModifierChecks,
    refine,
  } satisfies PostModifierCheckTable;

  public static override readonly transforms = {
    ...Emitter.transforms,
    transform,
  } satisfies TransformTable;

  /**
   * Its emitter's `parameterTypes`, `.refine()`'s and `.transform()`'s: a
   * function taking the value as the methods chained before it typed it,
   * which an inline function's own parameter is typed by, as in the
   * interpreted chain, `.transform()`'s returning its type parameter.
   *
   * ```ts
   * StringSchemaEmitter._spellParameterTypes({ schema: <pvl.string().refine(isOk).optional()>, call: <.refine(isOk)> })
   * // ['(value: string) => boolean', '{ message?: string } | undefined']
   * ```
   */
  public static override _spellParameterTypes(
    args: SpellParameterTypesArgs,
  ): ReadonlyArray<string> | undefined {
    const { schema, call } = args;
    if (call.name === MODIFIER_NAME.REFINE) {
      const { output } = this._spellTypes({ schema, chainEnd: call.chainIndex });
      return [`(value: ${output}) => boolean`, ISSUE_OPTIONS_TYPE];
    }
    if (call.name === MODIFIER_NAME.TRANSFORM) {
      const { output } = this._spellTypes({ schema, chainEnd: call.chainIndex });
      return [`(value: ${output}) => ${this.spellTransformOutputType({ call })}`];
    }
    return super._spellParameterTypes(args);
  }

  /**
   * The factory call's types, with `| undefined` or `| null` added for each
   * `.optional()` and `.nullable()` chained before `chainEnd`, in chain
   * order, and the input `unknown` once a `.coerce()` is. A `.transform()`
   * makes the output its type parameter.
   *
   * ```ts
   * StringSchemaEmitter._spellTypes({ schema: <pvl.string().nullable().optional()> })
   * // { input: 'string | null | undefined', output: <the same> }
   * ```
   */
  public static override _spellTypes(args: SpellTypesArgs): SchemaTypes {
    const { input, output } = super._spellTypes(args);
    const { schema, chainEnd = Infinity } = args;
    const calls = schema.preModifierCalls.filter(({ chainIndex }) => chainIndex < chainEnd);
    const transformCall = [...schema.postModifierCalls]
      .reverse()
      .find((call) => call.name === MODIFIER_NAME.TRANSFORM && call.chainIndex < chainEnd);
    return {
      input: widenType(input, calls, { isInput: true }),
      output:
        transformCall === undefined
          ? widenType(output, calls, { isInput: false })
          : this.spellTransformOutputType({ call: transformCall }),
    };
  }
}
