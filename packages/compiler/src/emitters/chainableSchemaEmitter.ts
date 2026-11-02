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
import type { RuntimeArgument } from '../runtimeArgument/runtimeArgument.js';
import type { SchemaModifierCall } from '../schemas/types/modifierCall.js';

/**
 * The predicate `call` is passed when it is a `.refine()`, the Runtime
 * Argument it always is, which names the type parameter its type predicate
 * narrows the Output to (ADR-0051); `undefined` for any other call.
 *
 * ```ts
 * readRefinePredicate(<.refine(isAhoj)>) // <Runtime Argument isAhoj>
 * readRefinePredicate(<.optional()>)     // undefined
 * ```
 */
const readRefinePredicate = (call: SchemaModifierCall): RuntimeArgument | undefined =>
  call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.REFINE
    ? readFunctionArgument(call.args?.[0])
    : undefined;

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
    const refinePredicate = readRefinePredicate(call);
    if (refinePredicate !== undefined) {
      const { output } = this._spellTypes({ schema, before: call });
      return [
        `((value: ${output.text}) => value is ${refinePredicate.refinedTypeParameterName}) | ((value: ${output.text}) => boolean)`,
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
   * The type parameter the root's Compiled Schema declares for the function
   * passed to `call`, which its type from `_spellParameterTypes` names:
   * `.transform()`'s return type, and a `.refine()`'s narrowed type, bounded
   * and defaulted by the Output the methods chained before it left, so a
   * `boolean` predicate leaves it as it was (ADR-0051). Each has a default,
   * so their order is free.
   *
   * ```ts
   * StringSchemaEmitter._spellTypeParameter({ schema: <pvl.string().optional().refine(isOk)>, call: <.refine(isOk)> })
   * // 'TArg0Refined extends string | undefined = string | undefined'
   * StringSchemaEmitter._spellTypeParameter({ schema: <pvl.string().transform(trim)>, call: <.transform(trim)> })
   * // 'TArg0Output = unknown'
   * StringSchemaEmitter._spellTypeParameter({ schema: <pvl.string().max(max)>, call: <.max(max)> })
   * // undefined
   * ```
   */
  public static override _spellTypeParameter({
    schema,
    call,
  }: SpellParameterTypesArgs): string | undefined {
    const refinePredicate = readRefinePredicate(call);
    if (refinePredicate !== undefined) {
      const { output } = this._spellTypes({ schema, before: call });
      return `${refinePredicate.refinedTypeParameterName} extends ${output.text} = ${output.text}`;
    }
    const transformFunction = schema.getTransformFunction();
    return call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.TRANSFORM &&
      transformFunction !== undefined
      ? `${transformFunction.outputTypeParameterName} = unknown`
      : undefined;
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
    const widenedInput = calls.some(
      (call) => call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.COERCE,
    )
      ? UNKNOWN_SPELLED_TYPE
      : widenType(input, calls);
    // A `.transform()` is chained last, so after any `before`.
    if (transformFunction !== undefined && before === undefined) {
      return {
        input: widenedInput,
        output: {
          text: transformFunction.outputTypeParameterName,
          undefinedness: UNDEFINEDNESS.CONDITIONAL,
        },
      };
    }
    // The last one's type parameter is bounded by those of the ones before it.
    const lastRefinePredicate = calls.flatMap((call) => readRefinePredicate(call) ?? []).at(-1);
    return {
      input: widenedInput,
      // widenType adds back the `| null`/`| undefined` chained before it too, which skip it.
      output: widenType(
        lastRefinePredicate === undefined
          ? output
          : { ...output, text: lastRefinePredicate.refinedTypeParameterName },
        calls,
      ),
    };
  }
}
