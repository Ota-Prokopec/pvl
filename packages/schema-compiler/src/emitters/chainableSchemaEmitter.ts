// The code the Shared Modifiers of `ChainableInterpretedSchema` compile to:
// `.optional()` and `.nullable()`, held in its `shortCircuitConditions`
// table, each returning the condition under which a value short-circuits,
// since a value it accepts skips every later check; `.refine()`, held in its
// `postModifierChecks` table, and `.transform()`, written by its
// `_emitTransform` hook, which call the user's own functions; and
// `.coerce()`, the identity here, which a primitive's emitter converts with
// in its `_emitCoercion` hook. It also spells the types they widen. Every
// schema's emitter extends it, as every schema extends
// `ChainableInterpretedSchema`.
import { ISSUE_CODE, replaceEmptyIssueMessage, type ChainableInterpretedSchema } from '@pvl/schema';
import { ISSUE_OPTIONS_TYPE } from '../consts.js';
import { PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM } from '@pvl/schema';
import { UNDEFINEDNESS } from '../enums.js';
import { emitConstraintIssue } from '../issue.js';
import type { RuntimeArgument } from '../schemas/runtimeArgument.js';
import type { SchemaModifierCall, SchemaTypes, SpelledType } from '../schemas/schemaTypes.js';
import { Emitter } from './emitter.js';
import type { EmittedShortCircuitCondition } from './types/emittedText.js';
import type {
  CompilesMethodArgs,
  EmitTransformArgs,
  SpellParameterTypesArgs,
  SpellTypesArgs,
} from './types/hookArgs.js';
import type {
  EmitterArgs,
  EmitterMethodOf,
  PostModifierCheckTable,
  ShortCircuitConditionTable,
} from './types/methodTables.js';
import type { TransformParts } from './types/schemaParts.js';
import { emitFunctionCall, readFunctionArgument } from './utils/arguments.js';
import { emitCheck, emitShortCircuitCondition, emitTransform } from './utils/emittedText.js';
import { js } from './utils/js.js';
import { readCallArguments } from './utils/methodCall.js';

// The Input of a coerced Schema, which takes any value.
const UNKNOWN_TYPE: SpelledType = { text: 'unknown', undefinedness: UNDEFINEDNESS.ALWAYS };

/**
 * `type` with `| undefined` or `| null` added for each `.optional()` and
 * `.nullable()` in `calls`, in chain order, admitting `undefined` once an
 * `.optional()` is.
 *
 * ```ts
 * widenType({ text: 'string', undefinedness: 'NEVER' }, [nullable(), optional()]) // { text: 'string | null | undefined', undefinedness: 'ALWAYS' }
 * widenType({ text: 'string', undefinedness: 'NEVER' }, [min(3)])                 // { text: 'string', undefinedness: 'NEVER' }
 * ```
 */
const widenType = (type: SpelledType, calls: ReadonlyArray<SchemaModifierCall>): SpelledType => {
  return calls.reduce(
    (widened, call): SpelledType =>
      call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.OPTIONAL
        ? { text: `${widened.text} | undefined`, undefinedness: UNDEFINEDNESS.ALWAYS }
        : call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.NULLABLE
          ? { ...widened, text: `${widened.text} | null` }
          : widened,
    type,
  );
};

/**
 * The function `transformCall`, a `.transform(fn)`, is passed, read as
 * `.transform()`'s own parameters type it: the Runtime Argument it always
 * is (`readFunctionArgument`).
 *
 * ```ts
 * readTransformFunction(<.transform(trim)>) // <Runtime Argument trim>
 * ```
 */
const readTransformFunction = (transformCall: SchemaModifierCall): RuntimeArgument => {
  const [fn]: EmitterArgs<Parameters<ChainableInterpretedSchema['transform']>> =
    readCallArguments(transformCall);
  return readFunctionArgument(fn);
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
 * `.refine(isOk)` → `!this.arg0.call(undefined, field0 as never)`, reporting
 * `CUSTOM`, whose default message is the one `@pvl/schema`'s `Issue` gives an
 * Issue reported without one.
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
   * `.transform(fn)` → `field0 = this.arg0.call(undefined, field0 as never);`,
   * which the Frame runs only when nothing failed, behind the count of
   * Issues taken before `schema`'s checks, named after the value.
   *
   * ```ts
   * StringSchemaEmitter._emitTransform({ schema: <pvl.string().transform(trim)>, target: { value: 'field0', path, issuePath } })
   * // { issueCount: 'field0IssueCount', statement: 'field0 = this.arg0.call(undefined, field0 as never);' }
   * StringSchemaEmitter._emitTransform({ schema: <pvl.string()>, target }) // undefined
   * ```
   */
  public static override _emitTransform({
    schema: { transformCall },
    target: { value },
  }: EmitTransformArgs): TransformParts | undefined {
    if (transformCall === undefined) {
      return undefined;
    }
    const fn = readTransformFunction(transformCall);
    return {
      issueCount: `${value}IssueCount`,
      statement: emitTransform({ statement: js`${value} = ${emitFunctionCall(fn, value)};` }),
    };
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
    if (call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.REFINE) {
      const { output } = this._spellTypes({ schema, before: call });
      return [`(value: ${output.text}) => boolean`, ISSUE_OPTIONS_TYPE];
    }
    if (call === schema.transformCall) {
      const { output } = this._spellTypes({ schema, before: call });
      return [`(value: ${output.text}) => ${readTransformFunction(call).outputTypeParameterName}`];
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
    const { transformCall } = schema;
    const calls = schema.findCallsBefore(before);
    return {
      input: calls.some((call) => call.name === PVL_SCHEMA_MODIFIER_METHOD_NAMES_ENUM.COERCE)
        ? UNKNOWN_TYPE
        : widenType(input, calls),
      // A `.transform()` is chained last, so after any `before`.
      output:
        transformCall === undefined || before !== undefined
          ? widenType(output, calls)
          : {
              text: readTransformFunction(transformCall).outputTypeParameterName,
              undefinedness: UNDEFINEDNESS.CONDITIONAL,
            },
    };
  }
}
