// The code the Shared Modifiers of `ChainableInterpretedSchema` compile to:
// `.optional()` and `.nullable()`, held in its `shortCircuitConditions`
// table, and `.refine()`, held in its `postModifierChecks` table, written in
// `utils/sharedModifiers.ts`; `.transform()`, written by its
// `_emitTransform` hook, which calls the user's own function; and
// `.coerce()`, the identity here, which a primitive's emitter converts with
// in its `_emitCoercion` hook. It also spells the types they widen. Every
// schema's emitter extends it, as every schema extends
// `ChainableInterpretedSchema`.
import { PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM } from '@pvl/schema';
import { CHECK_OPTIONS_TYPE_STRING } from './consts/checkOptions.js';
import { UNDEFINEDNESS } from '../enums.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import { UNKNOWN_SPELLED_TYPE } from './consts/spelledTypes.js';
import { Emitter } from './emitter.js';
import type {
  CompilesMethodArgs,
  EmitTransformArgs,
  SpellParameterTypesArgs,
  SpellTypesArgs,
} from './types/hookArgs.js';
import type { PostModifierCheckTable, ShortCircuitConditionTable } from './types/methodTables.js';
import type { EmittedTransform } from './types/emittedText.js';
import { emitFunctionCall } from './utils/arguments.js';
import { emitTransform } from './utils/emittedText.js';
import { js } from './utils/js.js';
import { nullable, optional, refine } from './utils/sharedModifiers.js';
import { widenType } from './utils/spelledType.js';

export class ChainableSchemaEmitter extends Emitter {
  public static override readonly shortCircuitConditions = {
    ...Emitter.shortCircuitConditions,
    optional,
    nullable,
  } satisfies ShortCircuitConditionTable;

  public static override readonly postModifierChecks = {
    ...Emitter.postModifierChecks,
    refine,
  } satisfies PostModifierCheckTable;

  /**
   * Whether it compiles the Schema method `name`: one of its tables holds
   * it, or it is `.coerce()` or `.transform()`, which a hook emits
   * (`_emitCoercion`, `_emitTransform`).
   *
   * ```ts
   * StringSchemaEmitter.compilesMethod({ name: 'transform' }) // true
   * EnumSchemaEmitter.compilesMethod({ name: 'coerce' })      // true: the identity
   * ```
   */
  public static override compilesMethod(args: CompilesMethodArgs): boolean {
    return (
      args.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.COERCE ||
      args.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.TRANSFORM ||
      super.compilesMethod(args)
    );
  }

  /**
   * `.transform(fn)` → `field0 = this.arg0.call(undefined, field0 as never);`.
   *
   * ```ts
   * StringSchemaEmitter._emitTransform({ schema: <pvl.string().transform(trim)>, target: { value: 'field0', path, issuePath } })
   * // 'field0 = this.arg0.call(undefined, field0 as never);'
   * StringSchemaEmitter._emitTransform({ schema: <pvl.string()>, target }) // undefined
   * ```
   */
  public static override _emitTransform({
    schema,
    target: { value },
  }: EmitTransformArgs): EmittedTransform | undefined {
    const transformFunction = schema.getTransformFunction();
    if (transformFunction === undefined) {
      return undefined;
    }
    return emitTransform({
      statement: js`${value} = ${emitFunctionCall(transformFunction, value)};`,
    });
  }

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
