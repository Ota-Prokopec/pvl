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
import type { SchemaTypes, SpelledGenericType, SpelledType } from '../spelledType/types.js';
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
   * Its emitter's `parameterTypes`, and `.refine()`'s and `.transform()`'s: a
   * function taking the value as the methods chained before it typed it,
   * which an inline function's own parameter is typed by, as in the
   * interpreted chain, spelled with the type parameter it names, which the
   * root's Compiled Schema declares. `.transform()`'s returns its type
   * parameter. A `.refine()`'s is either a type predicate for its type
   * parameter or a `boolean` one, the type parameter bounded and defaulted by
   * the value's type, so a `boolean` predicate leaves the Output as it was
   * (ADR-0051). Each type parameter has a default, so their order is free.
   *
   * ```ts
   * StringSchemaEmitter._spellParameterTypes({ schema: <pvl.string().optional().refine(isOk)>, call: <.refine(isOk)> })
   * // [{ text: '((value: string | undefined) => value is TArg0Refined) | ((value: string | undefined) => boolean)', undefinedness: 'NEVER', typeParameter: 'TArg0Refined extends string | undefined = string | undefined' }, '{ message?: string } | undefined']
   * StringSchemaEmitter._spellParameterTypes({ schema: <pvl.string().optional().transform(trim)>, call: <.transform(trim)> })
   * // [{ text: '(value: string | undefined) => TArg0Output', undefinedness: 'NEVER', typeParameter: 'TArg0Output = unknown' }]
   * ```
   */
  public static override _spellParameterTypes(
    args: SpellParameterTypesArgs,
  ): ReadonlyArray<string | SpelledGenericType> | undefined {
    const { schema, call } = args;
    if (
      call.name !== PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.REFINE &&
      call.name !== PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.TRANSFORM
    ) {
      return super._spellParameterTypes(args);
    }

    const functionArgument = readFunctionArgument(call.args?.[0]);
    const { output } = this._spellTypes({ schema, before: call });
    // A function's type never admits `undefined`.
    if (call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.TRANSFORM) {
      return [
        {
          text: `(value: ${output.text}) => ${functionArgument.outputTypeParameterName}`,
          undefinedness: UNDEFINEDNESS.NEVER,
          typeParameter: `${functionArgument.outputTypeParameterName} = unknown`,
        },
      ];
    }
    return [
      {
        text: `((value: ${output.text}) => value is ${functionArgument.refinedTypeParameterName}) | ((value: ${output.text}) => boolean)`,
        undefinedness: UNDEFINEDNESS.NEVER,
        typeParameter: `${functionArgument.refinedTypeParameterName} extends ${output.text} = ${output.text}`,
      },
      CHECK_OPTIONS_TYPE_STRING,
    ];
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

    // Each .refine()'s type parameter extends the Output before it, so the last one's is the narrowest.
    const lastRefineCall = calls
      .filter((call) => call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.REFINE)
      .at(-1);
    const refinedOutput: SpelledType =
      lastRefineCall === undefined
        ? output
        : {
            ...output,
            text: readFunctionArgument(lastRefineCall.args?.[0]).refinedTypeParameterName,
          };

    return {
      input: calls.some((call) => call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.COERCE)
        ? UNKNOWN_SPELLED_TYPE
        : widenType(input, calls),
      // A `.transform()` is chained last, so after any `before`. widenType adds
      // back the `| null`/`| undefined` chained before a `.refine()` too, which skip it.
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
