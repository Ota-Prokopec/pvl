// The code an `ArraySchema` compiles to, one method per method of
// `ArrayInterpretedSchema` it mirrors, held in its `postModifierSteps`
// table, and the composite parts of a compiled array, at the root or nested
// in another Schema: one loop with the element's checks inlined into it, a
// nested object's or array's included.
import { ARRAY_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, type ArrayInterpretedSchema } from '@pvl/schema';
import type { Schema } from '../schemas/schema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { ARRAY_ARGUMENT_MESSAGES } from './consts/argumentMessages.js';
import type { EmittedCheck } from './types/emittedText.js';
import type {
  EmitElementPropertyArgs,
  EmitSchemaCompositePartsArgs,
  SpellTypesArgs,
} from './types/hookArgs.js';
import type {
  EmitterMethodOf,
  ParameterTypesOf,
  PostModifierStepTable,
} from './types/methodTables.js';
import type {
  CheckingTarget,
  CompositeLocalVariableNames,
  SchemaCompositeParts,
} from './types/schemaParts.js';
import type { EmittedStandaloneProperty } from './types/standaloneProperties.js';
import { emitArgument } from './utils/arguments.js';
import { emitCheck, emitTypeCheck, emitVariableDeclaration } from './utils/emittedText.js';
import { composeBlock, js } from './utils/js.js';
import type { EmitBaseCheckArgs } from './schemaEmitter.js';
import { emitConstraintIssue, emitDefaultMessage } from '../issue.js';
import { CHECK_OPTIONS_TYPE_STRING } from './consts/checkOptions.js';
import type { Scope } from '../scope.js';
import type { ArraySchema } from '../schemas/arraySchema.js';
import type { SchemaTypes, SpelledType } from '../spelledType/types.js';
import { UNDEFINEDNESS } from '../enums.js';

/**
 * An array type of `elementType` parenthesised.
 *
 * ```ts
 * spellArrayType({ text: 'string', undefinedness: 'NEVER' })                  // { text: '(string)[]', undefinedness: 'NEVER' }
 * spellArrayType({ text: 'string | undefined', undefinedness: 'ALWAYS' })     // { text: '(string | undefined)[]', undefinedness: 'NEVER' }
 * ```
 */
const spellArrayType = ({ text }: SpelledType): SpelledType => {
  return {
    text: `(${text})[]`,
    undefinedness: UNDEFINEDNESS.NEVER,
  };
};

/** What {@link emitLoop} loops over an array for: its element's Schema, the array at its target, and the array's locals. */
export type EmitLoopArgs = {
  elementSchema: Schema;
  /** The array's target, whose value is looped over. */
  target: CheckingTarget;
  locals: CompositeLocalVariableNames;
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
}) => ({
  check: emitCheck({
    failsWhen: js`${value}.length < ${emitArgument(minLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_SMALL,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(ARRAY_ARGUMENT_MESSAGES.min, minLength),
    }),
  }),
});

/** `.max(10)` → `value.length > 10`, reporting `TOO_BIG`. */
const max: EmitterMethodOf<ArrayInterpretedSchema['max']> = ({
  target: { value, issuePath },
  args: [maxLength, options],
}) => ({
  check: emitCheck({
    failsWhen: js`${value}.length > ${emitArgument(maxLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.TOO_BIG,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(ARRAY_ARGUMENT_MESSAGES.max, maxLength),
    }),
  }),
});

/** `.length(3)` → `value.length !== 3`, reporting `INVALID_LENGTH`. */
const length: EmitterMethodOf<ArrayInterpretedSchema['length']> = ({
  target: { value, issuePath },
  args: [exactLength, options],
}) => ({
  check: emitCheck({
    failsWhen: js`${value}.length !== ${emitArgument(exactLength)}`,
    issue: emitConstraintIssue({
      code: ISSUE_CODE.INVALID_LENGTH,
      path: issuePath,
      options,
      defaultMessage: emitDefaultMessage(ARRAY_ARGUMENT_MESSAGES.length, exactLength),
    }),
  }),
});

export class ArraySchemaEmitter extends ChainableSchemaEmitter {
  public static override readonly postModifierSteps = {
    ...ChainableSchemaEmitter.postModifierSteps,
    min,
    max,
    length,
  } satisfies PostModifierStepTable;

  public static override readonly parameterTypes: ParameterTypesOf<ArrayInterpretedSchema> = {
    min: ['number', CHECK_OPTIONS_TYPE_STRING],
    max: ['number', CHECK_OPTIONS_TYPE_STRING],
    length: ['number', CHECK_OPTIONS_TYPE_STRING],
  };

  public static override readonly argumentMessages = ARRAY_ARGUMENT_MESSAGES;

  /** `!Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static _emitBaseCheck({ target: { value, issuePath } }: EmitBaseCheckArgs): EmittedCheck {
    return emitTypeCheck({
      failsWhen: js`!Array.isArray(${value})`,
      message: ARRAY_SCHEMA_ISSUE_MESSAGE._checkType(),
      issuePath,
    });
  }

  /**
   * An array's composite parts, at the root or nested in another Schema:
   * its locals, the output it builds, declared among them, and one loop
   * with the element's checks inlined as its one child. The frame runs its
   * Constraints and `.refine()`s, which read that output, only once every
   * element has passed, and hands the output on.
   *
   * ```ts
   * ArraySchemaEmitter._emitSchemaCompositeParts({ schema: <pvl.array(pvl.string()).min(1)>, target: <field0 at [...path1, "tags"]>, scope })
   * // { locals: <locals ending in 2>, declarations: ['const output2: unknown[] = [];'],
   * //   childChecks: ['for (let index2 = 0; index2 < field0.length; index2++) {\n  const element2: unknown = field0[index2];\n  …\n  output2.push(element2);\n}'], setsChildrenApart: false, outputStatements: [] }
   * ```
   */
  protected static override _emitSchemaCompositeParts({
    schema,
    target,
    scope,
  }: EmitSchemaCompositePartsArgs<ArraySchema>): SchemaCompositeParts {
    // Numbered first, so before the element's own locals.
    const locals: CompositeLocalVariableNames = scope.nextCompositeLocals();
    return {
      locals,
      declarations: [
        emitVariableDeclaration({ name: locals.output, type: 'unknown[]', initializer: '[]' }),
      ],
      childChecks: [emitLoop({ elementSchema: schema.element, target, locals, scope })],
      setsChildrenApart: false,
      outputStatements: [],
    };
  }

  /**
   * An array of the element's types.
   *
   * ```ts
   * ArraySchemaEmitter._spellFactoryTypes({ schema: <pvl.array(pvl.enum(['A', 'B']).nullable())> })
   * // { input: { text: '("A" | "B" | null)[]', undefinedness: 'NEVER' }, output: <the same> }
   * ```
   */
  public static override _spellFactoryTypes({
    schema: { element },
  }: SpellTypesArgs<ArraySchema>): SchemaTypes {
    const { input, output } = element.emitter._spellTypes({ schema: element });
    return { input: spellArrayType(input), output: spellArrayType(output) };
  }

  /**
   * A compiled array's `element`: the element's own Compiled Schema, built
   * by the constructor, when it is marked `.standalone()`, and none
   * otherwise, as `ArrayInterpretedSchema`'s own `element` is `undefined`
   * then (ADR-0039).
   *
   * ```ts
   * ArraySchemaEmitter._emitElementProperty({ schema: <pvl.array(pvl.string())>, className: 'PvlCompiledSchema0' })
   * // undefined
   * ArraySchemaEmitter._emitElementProperty({ schema: <pvl.array(pvl.string().standalone())>, className: 'PvlCompiledSchema0' })
   * // { type: '{ readonly element: PvlSchema<string, string> & PvlStandaloneMarker }', declaration: 'readonly element: …;', statement: 'this.element = (new (class PvlCompiledSchema0_element …)() as …);' }
   * ```
   */
  protected static override _emitElementProperty({
    schema: { element },
    className,
  }: EmitElementPropertyArgs<ArraySchema>): EmittedStandaloneProperty | undefined {
    if (!element.isStandalone) {
      return undefined;
    }
    const elementSchema = element.emitter.emitStandaloneCompiledSchema({
      schema: element,
      className: js`${className}_element`,
    });
    return {
      type: js`{ readonly element: ${elementSchema.type} }`,
      declaration: js`readonly element: ${elementSchema.type};`,
      // A plain template: `js` would strip the multi-line class's indentation.
      statement: `this.element = ${elementSchema.expression};`,
    };
  }
}
