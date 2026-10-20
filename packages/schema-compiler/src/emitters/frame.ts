// Where one Schema's checks are composed. Its Emitter emits each part (the
// base check, the pre-modifiers' conditions, the declarations, the children's
// checks, the post-modifiers' checks, the output statements) and hands it to
// the Schema's Frame, which only composes them, placing each part behind the
// gate the Schema's position needs: the root of a Compiled Schema's
// `_checkType`, which returns on the first Issues it can and then the value
// it checked, or a parent, which reads that value back once the checks have
// run. The root's Frame also writes the Compiled Schema's class. Every part
// is source text, and a Frame writes no check of its own, only the
// JavaScript fragments it places (`emitterUtils.ts`, `../issue.ts`), and
// names the locals a composite's parts declare.
import {
  emitNoNewIssuesCondition,
  emitReturnIssues,
  emitReturnIssuesIfAny,
  emitRootIssuePath,
} from '../issue.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import type {
  CheckingTarget,
  EmittedCheck,
  EmittedOutputStatement,
  EmittedShortCircuitCondition,
  EmittedVariableDeclaration,
} from './emittersTypes.js';
import { emitReturnValue } from './emitterUtils.js';
import type { Scope } from './scope.js';

/** The Compiled Schema a root Frame writes the class of. */
export type FrameCompiledSchemaParams = {
  className: string;
  /** The line of the `pvl.compile()` call, named in the class's comment. */
  line: number;
  /** The Schema's `Input` and `Output` types, the class's type arguments. */
  types: SchemaTypes;
};

/** Where a Schema's checks are composed: nested, at the target its parent hands on, or at the root, as the body of a Compiled Schema's `_checkType`, which checks its own parameters. */
export type FramePosition =
  | {
      // Not root schema
      /** The Schema's value and the Issue path of an Issue about it, as its parent hands them on. */
      target: CheckingTarget;
      compiledSchemaParams?: undefined;
    }
  | {
      // Root schema
      target?: undefined;
      /** The Compiled Schema whose `_checkType` its checks are the body of, which makes it the root. */
      compiledSchemaParams: FrameCompiledSchemaParams;
    };

export type FrameConstructorArgs = FramePosition & {
  /** Numbers a nested Schema's locals. */
  scope: Scope;
  /** Whether it is a composite, holding other Schemas, whose checks build an output that replaces its value, declaring locals for it. */
  isComposite: boolean;
};

// The names of a Compiled Schema's `_checkType` parameters, which a root
// frame checks: the value, and the path its Issues are reported at.
const CHECK_TYPE_VALUE_PARAMETER_NAME = 'value' as const;
const CHECK_TYPE_PATH_PARAMETER_NAME = 'path' as const;

// What a root frame checks: `_checkType`'s value, whose Issues are reported
// at its path, or at none when it is empty.
const ROOT_CHECKING_TARGET: CheckingTarget = {
  value: CHECK_TYPE_VALUE_PARAMETER_NAME,
  issuePath: emitRootIssuePath(CHECK_TYPE_PATH_PARAMETER_NAME),
};

/**
 * Where a Schema's checks are composed, a builder its Emitter sets each part
 * on before composing them. Only the base check is required, and a second
 * `setBaseCheck` overwrites it; every `add…` part defaults to none, and
 * appends. It also names the locals a composite's parts declare for the
 * output they build. At the root, it builds its own target, checking
 * `_checkType`'s own `value` at its `path`, and its locals are plain
 * (`input`, `output`). Nested, a composite numbers its locals (`input1`,
 * `output1`), so they never clash
 * with its parent's, and keeps its Issue path in one (`path1`), so its
 * children's paths stay as short at any depth. A Schema that builds no
 * output takes no number and has no locals: reading one throws, which is a
 * bug in an emitter, never a user error.
 *
 * ```ts
 * new Frame({ scope, isComposite: true, compiledSchemaParams })
 * // { checkingTarget: { value: 'value', issuePath: 'path.length > 0 ? path : undefined' }, inputVariableName: 'input', outputVariableName: 'output', pathVariableName: 'path', … }
 * new Frame({ target: { value: 'field0', issuePath: '[...path, "user"]' }, scope, isComposite: true })
 * // { inputVariableName: 'input1', outputVariableName: 'output1', pathVariableName: 'path1', issuePath: 'path1', … }
 * new Frame({ target: { value: 'field1', issuePath: '[...path, "name"]' }, scope, isComposite: false })
 * // { issuePath: '[...path, "name"]', … }: `scope` numbers nothing, and `.inputVariableName` throws
 * ```
 */
export class Frame {
  /** The Schema's value and the Issue path of an Issue about it, as its parent hands them on, or `_checkType`'s own at the root. */
  public readonly checkingTarget: CheckingTarget;
  /** The Issue path of an Issue about the Schema itself: `path.length > 0 ? path : undefined` at the root, `path1`, … for a nested composite. */
  public readonly issuePath: string;

  private readonly isComposite: boolean;

  private readonly compiledSchemaParams?: FrameCompiledSchemaParams;

  // What a composite's locals end in: '' at the root, '1', '2', … nested;
  // `undefined` for a Schema that isn't a composite, so has none.
  private readonly localSuffix: string | undefined;

  private readonly shortCircuitConditions: EmittedShortCircuitCondition[] = [];
  private baseCheck?: EmittedCheck;
  private readonly postModifierChecks: EmittedCheck[] = [];

  private readonly variableDeclarations: EmittedVariableDeclaration[] = [];
  private readonly childChecks: string[] = [];
  private readonly outputStatements: EmittedOutputStatement[] = [];

  /** A frame for the Schema at `target`, or at `_checkType`'s parameters at the root, numbering its locals from `scope` when it is a nested composite. */
  public constructor({ target, scope, isComposite, compiledSchemaParams }: FrameConstructorArgs) {
    this.checkingTarget = target ?? ROOT_CHECKING_TARGET;
    this.isComposite = isComposite;
    this.compiledSchemaParams = compiledSchemaParams;
    this.localSuffix = !isComposite ? undefined : this.isRoot ? '' : scope.nextLocalSuffix();
    this.issuePath =
      isComposite && !this.isRoot ? this.pathVariableName : this.checkingTarget.issuePath;
  }

  /** A local original input variable - scoped across frames, same suffix in one frame (using Scope class) - `input`, `input1`, … */
  public get inputVariableName(): string {
    return this.nameLocal('input');
  }

  /** A local original output variable - scoped across frames, same suffix in one frame (using Scope class) - `output`, `output1`, … */
  public get outputVariableName(): string {
    return this.nameLocal('output');
  }

  /** A local original array index variable - scoped across frames, same suffix in one frame (using Scope class) - `index`, `index1`, … */
  public get indexVariableName(): string {
    return this.nameLocal('index');
  }

  /** A local original array element (for element's schema) - scoped across frames, same suffix in one frame (using Scope class) - `element`, `element1`, … */
  public get elementVariableName(): string {
    return this.nameLocal('element');
  }

  /** A local original path variable - scoped across frames, same suffix in one frame (using Scope class) - `path`, `path1`, … */
  public get pathVariableName(): string {
    return this.nameLocal('path');
  }

  /** A local original issueCount variable - scoped across frames, same suffix in one frame (using Scope class) - `issueCount`, `issueCount1`, … */
  public get issueCountVariableName(): string {
    return this.nameLocal('issueCount');
  }

  /**
   * Whether it is a root schema.
   * Root schema: the Schema wrapped in `pvl.compile()`.
   **/
  private get isRoot(): boolean {
    return this.compiledSchemaParams !== undefined;
  }

  /**
   * Composes (assembles) a block (from `head` and `body`)
   *
   * ```ts
   * Frame.composeBlock({ head: 'if (ok)', body: 'run();\n\nstop();' })
   * // 'if (ok) {
   * //   run();
   * //   stop();
   * // }'
   * ```
   */
  public static composeBlock({ head, body }: { head: string; body: string }): string {
    const prettifiedBody = body
      .split('\n')
      .map((line) => (line === '' ? line : `${'  '}${line}`))
      .join('\n');
    return `${head} {\n${prettifiedBody}\n}`;
  }

  /** Sets the Schema's base check, the type check, over any set before. */
  public setBaseCheck(baseCheck: EmittedCheck): void {
    this.baseCheck = baseCheck;
  }

  /** Adds pre-modifiers' short-circuit conditions, any one of which skips every check. */
  public addShortCircuitConditions(
    ...shortCircuitConditions: EmittedShortCircuitCondition[]
  ): void {
    this.shortCircuitConditions.push(...shortCircuitConditions);
  }

  /** Adds local variable declarations. */
  public addDeclarations(...variableDeclarations: EmittedVariableDeclaration[]): void {
    this.variableDeclarations.push(...variableDeclarations);
  }

  /** Adds a composite's children's checks, each another Frame's composed checks. */
  public addChildChecks(...childChecks: string[]): void {
    this.childChecks.push(...childChecks);
  }

  /** Adds post-modifiers' checks, which run once the base check has passed, and every child has. */
  public addPostModifierChecks(...postModifierChecks: EmittedCheck[]): void {
    this.postModifierChecks.push(...postModifierChecks);
  }

  /** Adds statements building the output and handing it on, which run last. */
  public addOutputStatements(...outputStatements: EmittedOutputStatement[]): void {
    this.outputStatements.push(...outputStatements);
  }

  /**
   * The Schema's checks, as statements: its declarations, its children's
   * checks, its post-modifiers' checks behind their gate, and its output
   * statements, all once its base check has passed, then guarded by its
   * pre-modifiers' conditions.
   *
   * At the root as nested, the rest goes in the base check's `else`, so it
   * runs only once that check has passed, reading the value as the type it
   * checked. At the root, the `else` always returns, so the `return { issues }`
   * after it runs only when the base check failed, and a value a
   * pre-modifier accepts skips every check and is returned as it is, after
   * them. Nested, the checks can't return, as that would skip the parent's
   * other fields, and a value a pre-modifier accepts is left as it is.
   * Throws when no base check was set, which is a bug in an emitter, never a
   * user error.
   *
   * ```ts
   * <frame of value, at the root, shortCircuitConditions: ['value === undefined'], baseCheck: 'if (typeof value !== "string") { … }', outputStatements: ['return { value: value };']>.composeChecks()
   * // 'if (!((value === undefined))) {\n  if (typeof value !== "string") {\n    …\n  } else {\n    return { value: value };\n  }\n  return { issues };\n}\nreturn { value: value };'
   * <frame of field0, nested, baseCheck: 'if (typeof field0 !== "string") { … }', postModifierChecks: ['if (field0.length < 3) { … }']>.composeChecks()
   * // 'if (typeof field0 !== "string") {\n  …\n} else {\n  if (field0.length < 3) { … }\n}'
   * ```
   */
  public composeChecks(): string {
    const baseCheck = this.baseCheck;
    if (baseCheck === undefined) {
      throw new Error(
        `The frame of \`${this.checkingTarget.value}\` has no base check to compose.`,
      );
    }

    const statements = [
      ...this.variableDeclarations,
      ...this.childChecks,
      ...this.composePostModifierChecks(),
      ...this.outputStatements,
    ];

    const checks = [
      statements.length === 0
        ? baseCheck
        : Frame.composeBlock({
            head: `${baseCheck} else`,
            body: statements.join('\n'),
          }),
      // The root's `else` always returns, so only a failed base check gets here.
      ...(this.isRoot ? [emitReturnIssues()] : []),
    ].join('\n');

    if (this.shortCircuitConditions.length === 0) {
      return checks;
    }

    // Any one condition holding skips every check, so they run only when none does.
    const shortCircuits = this.shortCircuitConditions
      .map((shortCircuitCondition) => `(${shortCircuitCondition})`)
      .join(' || ');

    return [
      Frame.composeBlock({
        head: `if (!(${shortCircuits}))`,
        body: checks,
      }),
      // The short-circuit return value - then `outputStatements` already include its return statement, but this return statement is especially for short-circuit if walkaround
      ...(this.isRoot ? [emitReturnValue(this.checkingTarget.value)] : []),
    ].join('\n');
  }

  /**
   * The Compiled Schema's class declaration, extending `PvlSchema` (see
   * `COMPILED_SCHEMA_IMPORT`), whose `_checkType` collects its Issues and
   * runs the checks `composeChecks` composes at the root. Throws for a
   * nested frame, or when no base check was set, which is a bug in an
   * emitter, never a user error.
   *
   * ```ts
   * <frame of value, at the root, compiledSchemaParams: { className: 'PvlCompiledSchema0', line: 3, types: { input: '{ name: string }', … } }>.composeSchema()
   * // // pvl.compile() on line 3
   * // class PvlCompiledSchema0 extends PvlSchema<{ name: string }, { name: string }> {
   * //   override _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
   * //     const issues: PvlIssue[] = [];
   * //     …
   * //   }
   * // }
   * ```
   */
  public composeSchema(): string {
    const compiledSchemaParams = this.compiledSchemaParams;
    if (compiledSchemaParams === undefined) {
      throw new Error(
        `The frame of \`${this.checkingTarget.value}\` is nested, so it has no class to compose.`,
      );
    }

    const {
      className,
      line,
      types: { input, output },
    } = compiledSchemaParams;

    const statements = this.composeChecks();

    return [
      `// pvl.compile() on line ${String(line)}`,
      Frame.composeBlock({
        head: `class ${className} extends PvlSchema<${input}, ${output}>`,
        body: Frame.composeBlock({
          head: `override _checkType(${CHECK_TYPE_VALUE_PARAMETER_NAME}: unknown, ${CHECK_TYPE_PATH_PARAMETER_NAME}: ReadonlyArray<PropertyKey>): PvlResult<unknown>`,
          body: ['const issues: PvlIssue[] = [];', statements].join('\n'),
        }),
      }),
    ].join('\n');
  }

  /**
   * The post-modifiers' checks, behind the gate the Schema's position needs:
   * a post-modifier runs only once the type check has (ADR-0010), and a
   * composite's type check includes its children.
   *
   * At the root, `_checkType` returns the Issues as soon as there are any.
   * For a composite, one return comes after the children, so a failing child
   * skips the post-modifiers, and one after the post-modifiers, so a failing
   * one never reaches `return { value: output }`; with no post-modifiers,
   * only the first is written, still needed before that return. For a
   * Schema with no children, the base check's `else` already guards them,
   * so only the return after them is written, and only when there are any.
   *
   * Nested, they can't return, as that would skip the parent's other fields.
   * A composite's run inside `if (issues.length === issueCount1)`: an
   * unchanged Issue count means no child added an Issue. It compares with
   * the count taken before the children (which `Emitter.emitDeclarations`
   * declares), not with 0, as the one `issues` array may already hold the
   * parent's Issues. Those of a Schema with no children are written as they
   * are, as the base check's `else` already guards them.
   *
   * ```ts
   * <root composite, postModifierChecks: []>                              // ['if (issues.length > 0) { … }']
   * <root composite, postModifierChecks: ['if (value.length > 3) { … }']> // ['if (issues.length > 0) { … }', 'if (value.length > 3) { … }', 'if (issues.length > 0) { … }']
   * <root leaf, postModifierChecks: ['if (value.length > 2) { … }']>      // ['if (value.length > 2) { … }', 'if (issues.length > 0) { … }']
   * <root leaf, postModifierChecks: []>                                   // []
   * <nested composite, postModifierChecks: ['if (field0.length > 3) { … }']> // ['if (issues.length === issueCount1) {\n  if (field0.length > 3) { … }\n}']
   * <nested leaf, postModifierChecks: ['if (field0.length > 2) { … }']>   // ['if (field0.length > 2) { … }']
   * ```
   */
  private composePostModifierChecks(): string[] {
    const postModifierChecks = this.postModifierChecks;

    if (this.isRoot) {
      if (this.isComposite) {
        return postModifierChecks.length === 0
          ? [emitReturnIssuesIfAny()] // return { issues } if there are any issues from the nested schemas (e.g. when looping over array of items the issues are accumulating)
          : [emitReturnIssuesIfAny(), ...postModifierChecks, emitReturnIssuesIfAny()];
      }
      return postModifierChecks.length === 0
        ? [] // there are no elements to report issues, so there is no need for `emitReturnIssuesIfAny()`
        : [...postModifierChecks, emitReturnIssuesIfAny()];
    }

    // Is not a root schema
    if (this.isComposite && postModifierChecks.length > 0) {
      return [
        Frame.composeBlock({
          head: `if (${emitNoNewIssuesCondition(this.issueCountVariableName)})`,
          body: postModifierChecks.join('\n'),
        }),
      ];
    }
    return postModifierChecks;
  }

  /**
   * The name of a composite's local `name`, with the suffix that keeps it
   * apart from its parent's. Throws for a Schema that isn't a composite,
   * which has no locals.
   *
   * ```ts
   * <frame of field0, nested composite>.nameLocal('input') // 'input1'
   * <frame of field1, nested leaf>.nameLocal('input')      // throws
   * ```
   */
  private nameLocal(name: string): string {
    if (this.localSuffix === undefined) {
      throw new Error(
        `\`${this.checkingTarget.value}\` isn't a composite, so it has no \`${name}\` local.`,
      );
    }

    return `${name}${this.localSuffix}`;
  }
}
