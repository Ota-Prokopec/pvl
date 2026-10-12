// The code an `ArraySchema` compiles to, one static method per method of
// `ArraySchema` it mirrors, and the checks of a compiled array, at the root
// or nested in another Schema: one loop with the element's checks inlined
// into it, a nested object's or array's included.
import {
  ARRAY_SCHEMA_ISSUE_MESSAGE,
  ISSUE_CODE,
  type ArraySchema as PvlArraySchema,
  type Schema as PvlSchema,
} from '@pvl/schema';
import { ROOT_ISSUE_PATH } from '../consts.js';
import type { Schema } from '../schemas/schema.js';
import type { ArraySchema } from '../schemas/arraySchema.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitScope } from './emitScope.js';
import type { EmitChecksArgs, EmitSchemaArgs } from './emitter.js';
import type {
  EmitterMethodOf,
  EmittingCheckMethodInput,
  EmittingCheckMethodOutputWithCheck,
} from './emittersTypes.js';
import { emitIssue, js, type SchemaTypes } from './utils.js';

/** What an array's emitted checks call its locals: `index`, `element` and `output` at the root, `index1`, `element1` and `output1` nested. */
export type ArrayLocals = {
  index: string;
  element: string;
  output: string;
  /** The array's own Issue path, which its elements' paths extend. */
  path: string;
};

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

/** The `@pvl/schema` array whose methods `ArraySchemaEmitter`'s mirror, whatever its element. */
type PvlAnyArraySchema = PvlArraySchema<PvlSchema<unknown, unknown>>;

export class ArraySchemaEmitter extends ChainableSchemaEmitter {
  /** `!Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static override _getBaseCheck({
    target: { value, issuePath },
  }: EmitChecksArgs): EmittingCheckMethodOutputWithCheck {
    return {
      failsWhen: js`!Array.isArray(${value})`,
      issue: emitIssue(ISSUE_CODE.INVALID_TYPE, ARRAY_SCHEMA_ISSUE_MESSAGE._checkType(), issuePath),
    };
  }

  /** `.min(1)` → `value.length < 1`, reporting `TOO_SMALL`. */
  public static readonly min: EmitterMethodOf<PvlAnyArraySchema['min']> = ({
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
  public static readonly max: EmitterMethodOf<PvlAnyArraySchema['max']> = ({
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
  public static readonly length: EmitterMethodOf<PvlAnyArraySchema['length']> = ({
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
   * The body of a compiled array's `_checkType`: the type check, one loop
   * with the element's checks inlined, then the array's own Constraints in
   * chain order.
   */
  public static override _emitBody({ schema, scope }: EmitSchemaArgs<ArraySchema>): string {
    const rootTarget: EmittingCheckMethodInput = { value: 'value', issuePath: ROOT_ISSUE_PATH };
    const locals: ArrayLocals = {
      index: 'index',
      element: 'element',
      output: 'output',
      path: 'path',
    };
    const constraintChecks = super
      ._getPostModifierChecks({ schema, target: rootTarget, scope })
      .map((check) => this.emitCheck(check));
    return [
      'const issues: PvlIssue[] = [];',
      this.emitReturnIssueIfFails(this._getBaseCheck({ schema, target: rootTarget, scope })),
      'const output: unknown[] = [];',
      this._emitLoop({ elementSchema: schema.element, array: 'value', locals, scope }),
      this.emitReturnIssuesIfAny(),
      ...(constraintChecks.length === 0 ? [] : [...constraintChecks, this.emitReturnIssuesIfAny()]),
      'return { value: output };',
    ].join('\n');
  }

  /**
   * The post-modifiers' checks of an array nested in another Schema, at
   * `target`: one loop with the element's checks inlined, then its own
   * Constraints, which run only if every element passed, then the output,
   * which replaces the value at `target`. Its locals are numbered, and its
   * own path is kept in one, so its elements' paths stay as short at any
   * depth.
   *
   * ```ts
   * ArraySchemaEmitter._getPostModifierChecks({ schema: <pvl.array(pvl.string())>, target: { value: 'field0', issuePath: '[...path, "tags"]' }, scope })
   * // const path1 = [...path, "tags"];
   * // const output1: unknown[] = [];
   * // for (let index1 = 0; index1 < field0.length; index1++) {
   * //   const element1: unknown = field0[index1];
   * //   if (typeof element1 !== "string") { … path: [...path1, index1] … }
   * //   output1.push(element1);
   * // }
   * // field0 = output1;
   * ```
   */
  public static override _getPostModifierChecks({
    schema,
    target,
    scope,
  }: EmitChecksArgs<ArraySchema>): string[] {
    const suffix = scope.nextLocalSuffix();
    const locals: ArrayLocals = {
      index: `index${suffix}`,
      element: `element${suffix}`,
      output: `output${suffix}`,
      path: `path${suffix}`,
    };
    const issueCount = `issueCount${suffix}`;
    const constraintChecks = super
      ._getPostModifierChecks({
        schema,
        target: { value: target.value, issuePath: locals.path },
        scope,
      })
      .map((check) => this.emitCheck(check));
    return [
      js`const ${locals.path} = ${target.issuePath};`,
      ...(constraintChecks.length === 0 ? [] : [js`const ${issueCount} = issues.length;`]),
      js`const ${locals.output}: unknown[] = [];`,
      this._emitLoop({ elementSchema: schema.element, array: target.value, locals, scope }),
      ...(constraintChecks.length === 0
        ? []
        : [
            this.emitBlock({
              head: js`if (issues.length === ${issueCount})`,
              body: constraintChecks.join('\n'),
            }),
          ]),
      js`${target.value} = ${locals.output};`,
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
   * ArraySchemaEmitter._spellTypes({ schema: <pvl.array(pvl.enum(['A', 'B']).nullable())>, scope })
   * // { input: '("A" | "B" | null)[]', output: <the same> }
   * ```
   */
  public static override _spellTypes({ schema, scope }: EmitSchemaArgs<ArraySchema>): SchemaTypes {
    const { input, output } = schema.element.emitter._emitTypes({ schema: schema.element, scope });
    return { input: spellArrayType(input), output: spellArrayType(output) };
  }

  /**
   * The loop over `array` checking every element, each pushed onto the
   * output as it was read, or as its own checks rebuilt it.
   *
   * ```ts
   * for (let index = 0; index < value.length; index++) {
   *   const element: unknown = value[index];
   *   if (typeof element !== "string") { … path: [...path, index] … }
   *   output.push(element);
   * }
   * ```
   */
  private static _emitLoop({
    elementSchema,
    array,
    locals: { index, element, output, path },
    scope,
  }: {
    elementSchema: Schema;
    /** The array looped over, as an expression. */
    array: string;
    locals: ArrayLocals;
    scope: EmitScope;
  }): string {
    const { emitter } = elementSchema;
    return this.emitBlock({
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
  }
}
