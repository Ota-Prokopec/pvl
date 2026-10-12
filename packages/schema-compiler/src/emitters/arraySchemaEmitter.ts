// The code an `ArraySchema` compiles to, one static method per method of
// `ArraySchema` it mirrors, and the checks of a compiled array, at the root
// or nested in another Schema: one loop with the element's checks inlined
// into it, a nested object's or array's included.
import {
  ARRAY_SCHEMA_ISSUE_MESSAGE,
  ISSUE_CODE,
  type ArraySchema as PvlArraySchema,
} from '@pvl/schema';
import type { Schema } from '../schemas/schema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { CompositeFrame } from './compositeFrame.js';
import type { EmitScope } from './emitScope.js';
import type { EmitChecksArgs, EmitSchemaArgs, EmitTypedChecksArgs } from './emitter.js';
import type { EmitterMethodOf, EmittingCheckMethodOutputWithCheck } from './emittersTypes.js';
import { emitBlock, emitIssue, js } from './utils.js';
import type { ArraySchema } from '../schemas/arraySchema.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';

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

export type EmitLoopArgs = {
  elementSchema: Schema;
  /** The array looped over, as an expression. */
  array: string;
  frame: CompositeFrame;
  scope: EmitScope;
};
/**
 * The loop over `array` checking every element at its index, each pushed
 * onto the output as it was read, or as its own checks rebuilt it.
 *
 * ```ts
 * emitLoop({ elementSchema: <pvl.string()>, array: 'value', frame: <frame at the root>, scope })
 * // for (let index = 0; index < value.length; index++) {
 * //   const element: unknown = value[index];
 * //   if (typeof element !== "string") { … path: [...path, index] … }
 * //   output.push(element);
 * // }
 * ```
 */
const emitLoop = ({
  elementSchema,
  array,
  frame: { index, element, output, path },
  scope,
}: EmitLoopArgs): string => {
  const { emitter } = elementSchema;

  return emitBlock({
    head: js`for (let ${index} = 0; ${index} < ${array}.length; ${index}++)`,
    body: [
      js`${emitter._spellValueDeclaration()} ${element}: unknown = ${array}[${index}];`,
      emitter.emitSchemaChecks({
        schema: elementSchema,
        target: { value: element, issuePath: js`[...${path}, ${index}]` },
        scope,
      }),
      js`${output}.push(${element});`,
    ].join('\n'),
  });
};

export class ArraySchemaEmitter extends ChainableSchemaEmitter {
  /** `!Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static override _emitBaseCheck({
    target: { value, issuePath },
  }: EmitChecksArgs): EmittingCheckMethodOutputWithCheck {
    return {
      failsWhen: js`!Array.isArray(${value})`,
      issue: emitIssue(ISSUE_CODE.INVALID_TYPE, ARRAY_SCHEMA_ISSUE_MESSAGE._checkType(), issuePath),
    };
  }

  /** `.min(1)` → `value.length < 1`, reporting `TOO_SMALL`. */
  public static readonly min: EmitterMethodOf<PvlArraySchema['min']> = ({
    target: { value, issuePath },
    args: [minLength, options],
  }) => ({
    failsWhen: js`${value}.length < ${minLength}`,
    issue: emitIssue(
      ISSUE_CODE.TOO_SMALL,
      options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.min(minLength),
      issuePath,
    ),
  });

  /** `.max(10)` → `value.length > 10`, reporting `TOO_BIG`. */
  public static readonly max: EmitterMethodOf<PvlArraySchema['max']> = ({
    target: { value, issuePath },
    args: [maxLength, options],
  }) => ({
    failsWhen: js`${value}.length > ${maxLength}`,
    issue: emitIssue(
      ISSUE_CODE.TOO_BIG,
      options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.max(maxLength),
      issuePath,
    ),
  });

  /** `.length(3)` → `value.length !== 3`, reporting `INVALID_LENGTH`. */
  public static readonly length: EmitterMethodOf<PvlArraySchema['length']> = ({
    target: { value, issuePath },
    args: [exactLength, options],
  }) => ({
    failsWhen: js`${value}.length !== ${exactLength}`,
    issue: emitIssue(
      ISSUE_CODE.INVALID_LENGTH,
      options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.length(exactLength),
      issuePath,
    ),
  });

  /**
   * An array's checks once its type check has passed, at the root or nested
   * in another Schema: one loop with the element's checks inlined, then its
   * own Constraints in chain order, which run only once every element has
   * passed, then the output, handed on.
   *
   * ```ts
   * ArraySchemaEmitter._emitTypedChecks({ schema: <pvl.array(pvl.string()).min(1)>, target: { value: 'field0', issuePath: '[...path, "tags"]' }, scope, isRoot: false })
   * // const path1 = [...path, "tags"];
   * // const issueCount1 = issues.length;
   * // const output1: unknown[] = [];
   * // for (let index1 = 0; index1 < field0.length; index1++) {
   * //   const element1: unknown = field0[index1];
   * //   if (typeof element1 !== "string") { … path: [...path1, index1] … }
   * //   output1.push(element1);
   * // }
   * // if (issues.length === issueCount1) {
   * //   if (field0.length < 1) { … path: path1 … }
   * // }
   * // field0 = output1;
   * ```
   */
  public static override _emitTypedChecks({
    schema,
    target,
    scope,
    isRoot,
  }: EmitTypedChecksArgs<ArraySchema>): string[] {
    const frame = new CompositeFrame({ target, scope, isRoot });
    const constraintChecks = this.emitPostModifierChecks({
      schema,
      target: { value: target.value, issuePath: frame.issuePath },
      scope,
    });

    return [
      ...frame.emitDeclarations({ readsPath: true, postModifierChecks: constraintChecks }),
      js`const ${frame.output}: unknown[] = [];`,
      emitLoop({ elementSchema: schema.element, array: target.value, frame, scope }),
      ...frame.emitOnceChildrenPassed({ postModifierChecks: constraintChecks }),
      frame.emitOutputHandoff(),
    ];
  }

  /**
   * `let`: a nested array's value is replaced by the output its checks
   * build.
   *
   * ```ts
   * ArraySchemaEmitter._spellValueDeclaration() // 'let'
   * ```
   */
  public static override _spellValueDeclaration(): 'const' | 'let' {
    return 'let';
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
  }: EmitSchemaArgs<ArraySchema>): SchemaTypes {
    const { input, output } = element.emitter._spellTypes({ schema: element });
    return { input: spellArrayType(input), output: spellArrayType(output) };
  }
}
