// The code an `ArraySchema` compiles to, one static method per method of
// `ArraySchema` it mirrors, and the body of a compiled array's `_checkType`:
// one loop with the element's checks inlined into it.
import { ARRAY_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, type IssueEditableProps } from '@pvl/schema';
import { ROOT_ISSUE_PATH } from '../consts.js';
import { SCHEMA_FACTORY } from '../enums.js';
import type { SchemaModel } from '../schemaModel.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import { findFlatEmitter } from './flatEmitters.js';
import { emitIssue, js, type EmitTarget, type EmittedCheck, type SchemaTypes } from './utils.js';

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

export class ArraySchemaEmitter extends ChainableSchemaEmitter {
  /** `!Array.isArray(value)`, reporting `INVALID_TYPE`. */
  public static override _checkType({ value, path }: EmitTarget): EmittedCheck {
    return {
      failsWhen: js`!Array.isArray(${value})`,
      issue: emitIssue(ISSUE_CODE.INVALID_TYPE, ARRAY_SCHEMA_ISSUE_MESSAGE._checkType(), path),
    };
  }

  /** `.min(1)` → `value.length < 1`, reporting `TOO_SMALL`. */
  public static min(
    { value, path }: EmitTarget,
    minLength: number,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value}.length < ${minLength}`,
      issue: emitIssue(
        ISSUE_CODE.TOO_SMALL,
        options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.min(minLength),
        path,
      ),
    };
  }

  /** `.max(10)` → `value.length > 10`, reporting `TOO_BIG`. */
  public static max(
    { value, path }: EmitTarget,
    maxLength: number,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value}.length > ${maxLength}`,
      issue: emitIssue(
        ISSUE_CODE.TOO_BIG,
        options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.max(maxLength),
        path,
      ),
    };
  }

  /** `.length(3)` → `value.length !== 3`, reporting `INVALID_LENGTH`. */
  public static length(
    { value, path }: EmitTarget,
    exactLength: number,
    options?: IssueEditableProps,
  ): EmittedCheck {
    return {
      failsWhen: js`${value}.length !== ${exactLength}`,
      issue: emitIssue(
        ISSUE_CODE.INVALID_LENGTH,
        options?.message ?? ARRAY_SCHEMA_ISSUE_MESSAGE.length(exactLength),
        path,
      ),
    };
  }

  /**
   * The body of a compiled array's `_checkType`: the type check, one loop
   * with the element's checks inlined, then the array's own Constraints in
   * chain order.
   */
  public static override _emitBody(schema: SchemaModel): string {
    if (schema.factory !== SCHEMA_FACTORY.ARRAY) {
      throw new Error(`ArraySchemaEmitter can't emit a pvl.${schema.factory}().`);
    }
    const rootTarget: EmitTarget = { value: 'value', path: ROOT_ISSUE_PATH };
    const constraintChecks = schema.calls.map((call) => this.emitCallCheck(call, rootTarget));
    return [
      'const issues: PvlIssue[] = [];',
      this.emitReturnIssueIfFails(this._checkType(rootTarget)),
      'const output: unknown[] = [];',
      this.emitBlock(
        'for (let index = 0; index < value.length; index++)',
        [
          'const element: unknown = value[index];',
          findFlatEmitter(schema.element)._emitChecks(schema.element, {
            value: 'element',
            path: '[...path, index]',
          }),
          'output.push(element);',
        ].join('\n'),
      ),
      this.emitReturnIssuesIfAny(),
      ...(constraintChecks.length === 0
        ? []
        : [
            ...constraintChecks.map((check) => this.emitPushIssueIfFails(check)),
            this.emitReturnIssuesIfAny(),
          ]),
      'return { value: output };',
    ].join('\n');
  }

  /**
   * An array of the element's types.
   *
   * ```ts
   * ArraySchemaEmitter._spellTypes(<pvl.array(pvl.enum(['A', 'B']).nullable())>)
   * // { input: '("A" | "B" | null)[]', output: <the same> }
   * ```
   */
  public static override _spellTypes(schema: SchemaModel): SchemaTypes {
    if (schema.factory !== SCHEMA_FACTORY.ARRAY) {
      throw new Error(`ArraySchemaEmitter can't spell a pvl.${schema.factory}().`);
    }
    const { input, output } = findFlatEmitter(schema.element)._emitTypes(schema.element);
    return { input: spellArrayType(input), output: spellArrayType(output) };
  }
}
