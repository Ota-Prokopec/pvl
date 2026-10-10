// The code an `ArraySchema` compiles to, one static method per method of
// `ArraySchema` it mirrors, and the checks of a compiled array, at the root
// or nested in another Schema: one loop with the element's checks inlined
// into it, a nested object's or array's included.
import { ARRAY_SCHEMA_ISSUE_MESSAGE, ISSUE_CODE, type IssueEditableProps } from '@pvl/schema';
import { ROOT_ISSUE_PATH } from '../consts.js';
import { SCHEMA_FACTORY } from '../enums.js';
import type { SchemaModel } from '../schemaModel.js';
import { ChainableSchemaEmitter } from './chainableSchemaEmitter.js';
import type { EmitScope } from './emitScope.js';
import { emitIssue, js, type EmitTarget, type EmittedCheck, type SchemaTypes } from './utils.js';

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
  public static override _emitBody(schema: SchemaModel, scope: EmitScope): string {
    const rootTarget: EmitTarget = { value: 'value', path: ROOT_ISSUE_PATH };
    const locals: ArrayLocals = {
      index: 'index',
      element: 'element',
      output: 'output',
      path: 'path',
    };
    const constraintChecks = schema.calls.map((call) =>
      this.emitPushIssueIfFails(this.emitCallCheck(call, rootTarget)),
    );
    return [
      'const issues: PvlIssue[] = [];',
      this.emitReturnIssueIfFails(this._checkType(rootTarget)),
      'const output: unknown[] = [];',
      this._emitLoop(this._findElement(schema), 'value', locals, scope),
      this.emitReturnIssuesIfAny(),
      ...(constraintChecks.length === 0 ? [] : [...constraintChecks, this.emitReturnIssuesIfAny()]),
      'return { value: output };',
    ].join('\n');
  }

  /**
   * The checks of an array nested in another Schema, at `target`, once its
   * type check has passed: one loop with the element's checks inlined, then
   * its own Constraints, which run only if every element passed, then the
   * output, which replaces the value at `target`. Its locals are numbered,
   * and its own path is kept in one, so its elements' paths stay as short at
   * any depth.
   *
   * ```ts
   * ArraySchemaEmitter._emitTypedChecks(<pvl.array(pvl.string())>, { value: 'field0', path: '[...path, "tags"]' }, scope)
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
  public static override _emitTypedChecks(
    schema: SchemaModel,
    target: EmitTarget,
    scope: EmitScope,
  ): string {
    const suffix = scope.nextLocalSuffix();
    const locals: ArrayLocals = {
      index: `index${suffix}`,
      element: `element${suffix}`,
      output: `output${suffix}`,
      path: `path${suffix}`,
    };
    const issueCount = `issueCount${suffix}`;
    const constraintChecks = schema.calls.map((call) =>
      this.emitPushIssueIfFails(
        this.emitCallCheck(call, { value: target.value, path: locals.path }),
      ),
    );
    return [
      js`const ${locals.path} = ${target.path};`,
      ...(constraintChecks.length === 0 ? [] : [js`const ${issueCount} = issues.length;`]),
      js`const ${locals.output}: unknown[] = [];`,
      this._emitLoop(this._findElement(schema), target.value, locals, scope),
      ...(constraintChecks.length === 0
        ? []
        : [this.emitBlock(js`if (issues.length === ${issueCount})`, constraintChecks.join('\n'))]),
      js`${target.value} = ${locals.output};`,
    ].join('\n');
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
   * ArraySchemaEmitter._spellTypes(<pvl.array(pvl.enum(['A', 'B']).nullable())>, scope)
   * // { input: '("A" | "B" | null)[]', output: <the same> }
   * ```
   */
  public static override _spellTypes(schema: SchemaModel, scope: EmitScope): SchemaTypes {
    if (schema.factory !== SCHEMA_FACTORY.ARRAY) {
      throw new Error(`ArraySchemaEmitter can't spell a pvl.${schema.factory}().`);
    }
    const { input, output } = scope.findEmitter(schema.element)._emitTypes(schema.element, scope);
    return { input: spellArrayType(input), output: spellArrayType(output) };
  }

  /**
   * The element Schema of an array's SchemaModel. Throws for any other
   * Schema, which is a bug in the compiler, never a user error.
   *
   * ```ts
   * ArraySchemaEmitter._findElement(<pvl.array(pvl.string())>) // <pvl.string()>
   * ```
   */
  private static _findElement(schema: SchemaModel): SchemaModel {
    if (schema.factory !== SCHEMA_FACTORY.ARRAY) {
      throw new Error(`ArraySchemaEmitter can't emit a pvl.${schema.factory}().`);
    }
    return schema.element;
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
  private static _emitLoop(
    elementSchema: SchemaModel,
    array: string,
    { index, element, output, path }: ArrayLocals,
    scope: EmitScope,
  ): string {
    const emitter = scope.findEmitter(elementSchema);
    return this.emitBlock(
      js`for (let ${index} = 0; ${index} < ${array}.length; ${index}++)`,
      [
        js`${emitter._spellValueDeclaration()} ${element}: unknown = ${array}[${index}];`,
        emitter._emitChecks(
          elementSchema,
          { value: element, path: js`[...${path}, ${index}]` },
          scope,
        ),
        js`${output}.push(${element});`,
      ].join('\n'),
    );
  }
}
