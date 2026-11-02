// The code the Shared Modifiers of `ChainableInterpretedSchema` compile to,
// written in `utils/sharedModifiers.ts`: `.optional()` and `.nullable()`,
// held in its `preModifierSteps` table, and `.refine()` and `.transform()`,
// which call the user's own functions, held in its `postModifierSteps`
// table. It also spells the types they widen, and the Input `unknown` a
// primitive's or a literal's `.coerce()`, a Local Modifier, makes it. Every
// schema's emitter extends it, as every schema extends
// `ChainableInterpretedSchema`.
import { PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM } from '@pcvl/schema';
import { CHECK_OPTIONS_TYPE_STRING } from './consts/checkOptions.js';
import { UNDEFINEDNESS } from '../spelledType/enums.js';
import type { SchemaTypes } from '../spelledType/types.js';
import { UNKNOWN_SPELLED_TYPE } from '../spelledType/consts.js';
import { Emitter } from './emitter.js';
import type { SpellParameterTypesArgs, SpellTypesArgs } from './types/hookArgs.js';
import type { PostModifierStepTable, PreModifierStepTable } from './types/methodTables.js';
import { nullable, optional, refine, transform } from './utils/sharedModifiers.js';
import { widenType } from '../spelledType/spelledType.js';
import { readFunctionArgument } from '../runtimeArgument/utils.js';

export class ChainableSchemaEmitter extends Emitter {
  public static override readonly preModifierSteps = {
    ...Emitter.preModifierSteps,
    optional,
    nullable,
  } satisfies PreModifierStepTable;

  public static override readonly postModifierSteps = {
    ...Emitter.postModifierSteps,
    refine,
    transform,
  } satisfies PostModifierStepTable;

  /**
   * Its emitter's `parameterTypes`, `.refine()`'s and `.transform()`'s: a
   * function taking the value as the methods chained before it typed it,
   * which an inline function's own parameter is typed by, as in the
   * interpreted chain, `.transform()`'s returning its type parameter, and
   * `.refine()`'s either a type predicate for its type parameter or a
   * `boolean` one (ADR-0051).
   *
   * ```ts
   * StringSchemaEmitter._spellParameterTypes({ schema: <pvl.string().refine(isOk).optional()>, call: <.refine(isOk)> })
   * // ['((value: string) => value is TArg0Refined) | ((value: string) => boolean)', '{ message?: string } | undefined']
   * StringSchemaEmitter._spellParameterTypes({ schema: <pvl.string().optional().transform(trim)>, call: <.transform(trim)> })
   * // ['(value: string | undefined) => TArg0Output']
   * ```
   */
  public static override _spellParameterTypes(
    args: SpellParameterTypesArgs,
  ): ReadonlyArray<string> | undefined {
    const { schema, call } = args;
    const transformFunction = schema.getTransformFunction();
    if (call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.REFINE) {
      const { output } = this._spellTypes({ schema, before: call });
      const { refinedTypeParameterName } = readFunctionArgument(call.args?.[0]);
      return [
        `((value: ${output.text}) => value is ${refinedTypeParameterName}) | ((value: ${output.text}) => boolean)`,
        CHECK_OPTIONS_TYPE_STRING,
      ];
    }
    // A chain holds at most one `.transform()`, which `getTransformFunction` reads.
    if (
      call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.TRANSFORM &&
      transformFunction !== undefined
    ) {
      const { output } = this._spellTypes({ schema, before: call });
      return [`(value: ${output.text}) => ${transformFunction.outputTypeParameterName}`];
    }
    return super._spellParameterTypes(args);
  }

  /**
   * The factory call's types, with `| undefined` or `| null` added for each
   * `.optional()` and `.nullable()` chained before `before`, in chain order,
   * and the Input `unknown` once a `.coerce()` is. A `.refine()` makes
   * the Output its type parameter, keeping the `| undefined` and `| null`
   * chained before it (ADR-0051). Over the whole chain, a `.transform()`
   * makes the Output its type parameter, which admits `undefined` only when
   * its function may return it.
   *
   * ```ts
   * StringSchemaEmitter._spellTypes({ schema: <pvl.string().nullable().optional()> })
   * // { input: { text: 'string | null | undefined', undefinedness: 'ALWAYS' }, output: <the same> }
   * StringSchemaEmitter._spellTypes({ schema: <pvl.string().nullable().refine(isSet).optional()> })
   * // { input: { text: 'string | null | undefined', undefinedness: 'ALWAYS' }, output: { text: 'TArg0Refined | null | undefined', undefinedness: 'ALWAYS' } }
   * StringSchemaEmitter._spellTypes({ schema: <pvl.number().coerce().transform(String)> })
   * // { input: { text: 'unknown', undefinedness: 'ALWAYS' }, output: { text: 'TArg0Output', undefinedness: 'CONDITIONAL' } }
   * ```
   */
  public static override _spellTypes(args: SpellTypesArgs): SchemaTypes {
    const { input, output } = super._spellTypes(args);
    const { schema, before } = args;
    const transformFunction = schema.getTransformFunction();
    const calls = schema.findCallsBefore(before);
    // The last one's type parameter is bounded by those of the ones before it.
    const lastRefine = calls
      .filter((call) => call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.REFINE)
      .at(-1);
    // widenType adds back the `| null`/`| undefined` chained before it too, which skip it.
    const refinedOutput =
      lastRefine === undefined
        ? output
        : {
            ...output,
            text: readFunctionArgument(lastRefine.args?.[0]).refinedTypeParameterName,
          };
    return {
      input: calls.some((call) => call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.COERCE)
        ? UNKNOWN_SPELLED_TYPE
        : widenType(input, calls),
      // A `.transform()` is chained last, so after any `before`.
      output:
        transformFunction === undefined || before !== undefined
          ? widenType(refinedOutput, calls)
          : {
              text: transformFunction.outputTypeParameterName,
              undefinedness: UNDEFINEDNESS.CONDITIONAL,
            },
    };
  }
}
