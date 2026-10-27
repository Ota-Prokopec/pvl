// The code the Shared Modifiers of `ChainableInterpretedSchema` compile to,
// written in `utils/sharedModifiers.ts`: `.optional()`, `.nullable()` and
// `.coerce()`, the identity here, which a primitive's emitter overrides with
// its conversion, held in its `preModifierSteps` table, and `.refine()` and
// `.transform()`, which call the user's own functions, held in its
// `postModifierSteps` table. It also spells the types they widen. Every
// schema's emitter extends it, as every schema extends
// `ChainableInterpretedSchema`.
import { PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM } from '@pvl/schema';
import { CHECK_OPTIONS_TYPE_STRING } from './consts/checkOptions.js';
import { UNDEFINEDNESS } from '../enums.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import { UNKNOWN_SPELLED_TYPE } from './consts/spelledTypes.js';
import { Emitter } from './emitter.js';
import type { SpellParameterTypesArgs, SpellTypesArgs } from './types/hookArgs.js';
import type { PostModifierStepTable, PreModifierStepTable } from './types/methodTables.js';
import { coerce, nullable, optional, refine, transform } from './utils/sharedModifiers.js';
import { widenType } from './utils/spelledType.js';

export class ChainableSchemaEmitter extends Emitter {
  public static override readonly preModifierSteps = {
    ...Emitter.preModifierSteps,
    optional,
    nullable,
    coerce,
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
   * interpreted chain, `.transform()`'s returning its type parameter.
   *
   * ```ts
   * StringSchemaEmitter._spellParameterTypes({ schema: <pvl.string().refine(isOk).optional()>, call: <.refine(isOk)> })
   * // ['(value: string) => boolean', '{ message?: string } | undefined']
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
      return [`(value: ${output.text}) => boolean`, CHECK_OPTIONS_TYPE_STRING];
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
   * and the Input `unknown` once a `.coerce()` is. Over the whole chain, a
   * `.transform()` makes the Output its type parameter, which admits
   * `undefined` only when its function may return it.
   *
   * ```ts
   * StringSchemaEmitter._spellTypes({ schema: <pvl.string().nullable().optional()> })
   * // { input: { text: 'string | null | undefined', undefinedness: 'ALWAYS' }, output: <the same> }
   * StringSchemaEmitter._spellTypes({ schema: <pvl.number().coerce().transform(String)> })
   * // { input: { text: 'unknown', undefinedness: 'ALWAYS' }, output: { text: 'TArg0Output', undefinedness: 'CONDITIONAL' } }
   * ```
   */
  public static override _spellTypes(args: SpellTypesArgs): SchemaTypes {
    const { input, output } = super._spellTypes(args);
    const { schema, before } = args;
    const transformFunction = schema.getTransformFunction();
    const calls = schema.findCallsBefore(before);
    return {
      input: calls.some((call) => call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.COERCE)
        ? UNKNOWN_SPELLED_TYPE
        : widenType(input, calls),
      // A `.transform()` is chained last, so after any `before`.
      output:
        transformFunction === undefined || before !== undefined
          ? widenType(output, calls)
          : {
              text: transformFunction.outputTypeParameterName,
              undefinedness: UNDEFINEDNESS.CONDITIONAL,
            },
    };
  }
}
