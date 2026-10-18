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
import type { AddCompositePartsArgs, EmitChecksArgs, EmitSchemaArgs } from './emitter.js';
import type { EmitterMethodOf } from './emitterTypes.js';
import { emitIssue } from '../issue.js';
import { emitCheck, js } from './emitterUtils.js';
import { Frame } from './frame.js';
import type { Scope } from './scope.js';
import type { ArraySchema } from '../schemas/arraySchema.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import type { EmittedCheck, EmittedVariableDeclaration } from '../types.js';

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
  /** The array's frame, whose value is looped over. */
  frame: Frame;
  scope: Scope;
};
/**
 * The loop over the array in `frame`, checking every element at its index,
 * each pushed onto the output as it was read, or as its own checks rebuilt
 * it.
 *
 * ```ts
 * emitLoop({ elementSchema: <pvl.string()>, frame: <frame of value, at the root>, scope })
 * // for (let index = 0; index < value.length; index++) {
 * //   const element: unknown = value[index];
 * //   if (typeof element !== "string") { … path: [...path, index] … }
 * //   output.push(element);
 * // }
 * ```
 */
const emitLoop = ({ elementSchema, frame, scope }: EmitLoopArgs): string => {
  const { emitter } = elementSchema;
  const {
    indexVariableName: index,
    elementVariableName: element,
    outputVariableName: output,
    pathVariableName: path,
  } = frame;
  const array = frame.checkingTarget.value;

  return Frame.composeBlock({
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
  }: EmitChecksArgs): EmittedCheck {
    return emitCheck({
      failsWhen: js`!Array.isArray(${value})`,
      issue: emitIssue(ISSUE_CODE.INVALID_TYPE, ARRAY_SCHEMA_ISSUE_MESSAGE._checkType(), issuePath),
    });
  }

  /** `.min(1)` → `value.length < 1`, reporting `TOO_SMALL`. */
  public static readonly min: EmitterMethodOf<PvlArraySchema['min']> = ({
    target: { value, issuePath },
    args: [minLength, options],
  }) =>
    emitCheck({
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
  }) =>
    emitCheck({
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
  }) =>
    emitCheck({
      failsWhen: js`${value}.length !== ${exactLength}`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_LENGTH,
        options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.length(exactLength),
        issuePath,
      ),
    });

  /**
   * Adds to `frame` an array's parts once its type check has passed, at the
   * root or nested in another Schema: its locals, the output it builds
   * among them, and one loop with the element's checks inlined as its one
   * child. Its own Constraints are its post-modifiers' checks, which the
   * frame runs only once every element has passed, and the frame hands the
   * output on.
   *
   * ```ts
   * ArraySchemaEmitter._addCompositeParts({ schema: <pvl.array(pvl.string()).min(1)>, frame: <frame of field0 at [...path, "tags"], nested>, scope, isRoot: false, postModifierChecks: [<.min(1)>] })
   * // adds the declarations ['const path1 = [...path, "tags"];', 'const issueCount1 = issues.length;', 'const output1: unknown[] = [];']
   * // and the child's checks ['for (let index1 = 0; index1 < field0.length; index1++) {\n  const element1: unknown = field0[index1];\n  …\n  output1.push(element1);\n}']
   * ```
   */
  public static override _addCompositeParts({
    schema,
    frame,
    scope,
    isRoot,
    postModifierChecks,
  }: AddCompositePartsArgs<ArraySchema>): void {
    frame.addDeclarations(
      ...this.emitDeclarations({ frame, isRoot, readsPath: true, postModifierChecks }),
      js`const ${frame.outputVariableName}: unknown[] = [];` as EmittedVariableDeclaration,
    );
    frame.addChildChecks(emitLoop({ elementSchema: schema.element, frame, scope }));
  }

  /**
   * `true`: an array holds its element's Schema, and its checks build its
   * output, element by element, in locals of their own (`output`, `index`,
   * `element`; `output1`, … nested).
   *
   * ```ts
   * ArraySchemaEmitter._isComposite() // true
   * ```
   */
  public static override _isComposite(): boolean {
    return true;
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
