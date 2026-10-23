// The code an `ArraySchema` compiles to, one method per method of
// `ArrayInterpretedSchema` it mirrors, held in its `postModifierChecks` table, and the checks of a compiled array, at the root
// or nested in another Schema: one loop with the element's checks inlined
// into it, a nested object's or array's included.
import { ARRAY_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, type ArrayInterpretedSchema } from '@pvl/schema';
import type { Schema } from '../schemas/schema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitBaseCheckArgs, EmitSchemaPartsArgs, SpellFactoryTypesArgs } from './emitter.js';
import { emitConstraintIssue, emitDefaultMessage, emitIssue } from '../issue.js';
import { ISSUE_OPTIONS_TYPE } from '../consts.js';
import {
  composeBlock,
  emitArgument,
  emitCheck,
  emitVariableDeclaration,
  js,
} from './emitterUtils.js';
import type { Scope } from './scope.js';
import type { ArraySchema } from '../schemas/arraySchema.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import type {
  ArgumentMessagesOf,
  CheckingTarget,
  CompositeLocals,
  EmittedCheck,
  EmitterMethodOf,
  ParameterTypesOf,
  PostModifierCheckTable,
  SchemaParts,
} from './emittersTypes.js';

/**
 * An array type of `elementType`, parenthesised when it is a union.
 *
 * ```ts
 * spellArrayType('string')        // 'string[]'
 * spellArrayType('string | null') // '(string | null)[]'
 * ```
 */
const spellArrayType = (elementType: string): string => {
  return elementType.includes(' ') ? `(${elementType})[]` : `${elementType}[]`;
};

/** What {@link emitLoop} loops over an array for: its element's Schema, the array at its target, and the array's locals. */
export type EmitLoopArgs = {
  elementSchema: Schema;
  /** The array's target, whose value is looped over. */
  target: CheckingTarget;
  locals: CompositeLocals;
  scope: Scope;
};

/**
 * The loop over the array at `target`, checking every element at its
 * index, each pushed onto the output as it was read, or as its own checks
 * rebuilt it.
 *
 * ```ts
 * emitLoop({ elementSchema: <pvl.string()>, target: Frame.rootCheckingTarget, locals: <locals ending in 1>, scope })
 * // for (let index1 = 0; index1 < value.length; index1++) {
 * //   const element1: unknown = value[index1];
 * //   if (typeof element1 !== "string") { … path: [...path1, index1] … }
 * //   output1.push(element1);
 * // }
 * ```
 */
const emitLoop = ({ elementSchema, target, locals, scope }: EmitLoopArgs): string => {
  const { index, element, output, path } = locals;
  const array = target.value;

  return composeBlock({
    head: js`for (let ${index} = 0; ${index} < ${array}.length; ${index}++)`,
    body: [
      elementSchema.emitter.emitNestedSchemaChecks({
        schema: elementSchema,
        value: element,
        valueType: 'unknown',
        read: js`${array}[${index}]`,
        path: js`[...${path}, ${index}]`,
        scope,
      }),
      js`${output}.push(${element});`,
    ].join('\n'),
  });
};

/** `.min(1)` → `value.length < 1`, reporting `TOO_SMALL`. */
const min: EmitterMethodOf<ArrayInterpretedSchema['min']> = ({
  target: { value, issuePath },
  args: [minLength, options],
}) =>
  emitCheck({
    failsWhen: js`${value}.length < ${emitArgument(minLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_SMALL,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(ArraySchemaEmitter.argumentMessages.min, minLength),
    }),
  });

/** `.max(10)` → `value.length > 10`, reporting `TOO_BIG`. */
const max: EmitterMethodOf<ArrayInterpretedSchema['max']> = ({
  target: { value, issuePath },
  args: [maxLength, options],
}) =>
  emitCheck({
    failsWhen: js`${value}.length > ${emitArgument(maxLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_BIG,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(ArraySchemaEmitter.argumentMessages.max, maxLength),
    }),
  });

/** `.length(3)` → `value.length !== 3`, reporting `INVALID_LENGTH`. */
const length: EmitterMethodOf<ArrayInterpretedSchema['length']> = ({
  target: { value, issuePath },
  args: [exactLength, options],
}) =>
  emitCheck({
    failsWhen: js`${value}.length !== ${emitArgument(exactLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.INVALID_LENGTH,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(ArraySchemaEmitter.argumentMessages.length, exactLength),
    }),
  });

export class ArraySchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly postModifierChecks = {
    ...ChainableSchemaEmitter.postModifierChecks,
    min,
    max,
    length,
  } satisfies PostModifierCheckTable;

  public static override readonly parameterTypes: ParameterTypesOf<ArrayInterpretedSchema> = {
    min: ['number', ISSUE_OPTIONS_TYPE],
    max: ['number', ISSUE_OPTIONS_TYPE],
    length: ['number', ISSUE_OPTIONS_TYPE],
  };

  public static override readonly argumentMessages = {
    min: ARRAY_SCHEMA_ISSUE_MESSAGE.min,
    max: ARRAY_SCHEMA_ISSUE_MESSAGE.max,
    length: ARRAY_SCHEMA_ISSUE_MESSAGE.length,
  } satisfies ArgumentMessagesOf<ArrayInterpretedSchema>;

  /** `!Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitCheck({
      failsWhen: js`!Array.isArray(${value})`,
      issue: emitIssue({
        code: ISSUE_CODE.INVALID_TYPE,
        message: ARRAY_SCHEMA_ISSUE_MESSAGE._checkType(),
        path: issuePath,
      }),
    });
  }

  /**
   * An array's parts, at the root or nested in another Schema: its base
   * check, short-circuit conditions and post-modifiers' checks, which are
   * its own Constraints, and its composite parts: its locals, the output it
   * builds, declared among them, and one loop with the element's checks
   * inlined as its one child. The frame runs its Constraints only once every
   * element has passed, and hands the output on.
   *
   * ```ts
   * ArraySchemaEmitter._emitSchemaParts({ schema: <pvl.array(pvl.string()).min(1)>, target: <field0 at [...path1, "tags"]>, scope })
   * // { baseCheck: 'if (!Array.isArray(field0)) { … }', shortCircuitConditions: [], postModifierChecks: ['if (field0.length < 1) { … }'],
   * //   composite: { locals: <locals ending in 2>, declarations: ['const output2: unknown[] = [];'],
   * //                childChecks: ['for (let index2 = 0; index2 < field0.length; index2++) {\n  const element2: unknown = field0[index2];\n  …\n  output2.push(element2);\n}'], setsChildrenApart: false, outputStatements: [] } }
   * ```
   */
  public static override _emitSchemaParts(args: EmitSchemaPartsArgs<ArraySchema>): SchemaParts {
    const { schema, target, scope } = args;
    // Numbered first, so before the element's own locals.
    const locals: CompositeLocals = scope.nextCompositeLocals();
    return {
      ...super._emitSchemaParts(args),
      composite: {
        locals,
        declarations: [
          emitVariableDeclaration({ name: locals.output, type: 'unknown[]', initializer: '[]' }),
        ],
        childChecks: [emitLoop({ elementSchema: schema.element, target, locals, scope })],
        setsChildrenApart: false,
        outputStatements: [],
      },
    };
  }

  /**
   * An array of the element's types.
   *
   * ```ts
   * ArraySchemaEmitter._spellFactoryTypes({ schema: <pvl.array(pvl.enum(['A', 'B']).nullable())> })
   * // { input: '("A" | "B" | null)[]', output: <the same> }
   * ```
   */
  public static override _spellFactoryTypes({
    schema: { element },
  }: SpellFactoryTypesArgs<ArraySchema>): SchemaTypes {
    const { input, output } = element.emitter._spellTypes({ schema: element });
    return { input: spellArrayType(input), output: spellArrayType(output) };
  }
}
