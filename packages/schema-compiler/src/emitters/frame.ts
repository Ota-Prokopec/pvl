// Where one Schema's checks are composed. Its Emitter emits each part (the
// base check, the pre-modifiers' conditions, the declarations, the children's
// checks, the post-modifiers' checks, the output statements) and hands it to
// the Schema's Frame, which only composes them, placing each part behind the
// gate it needs, the same at the root of a Compiled Schema's `_validate` as
// nested in a parent: the root is checked at `_validate`'s own parameters
// (`Frame.rootCheckingTarget`), as a nested Schema is at the target its
// parent hands on (`Frame.createNestedCheckingTarget`). The root's Frame also
// wraps its checks in the Compiled Schema's class expression, which replaces
// its `pvl.compile(...)` call, and closes `_validate` with its one return.
// Every part is source text, and a Frame writes no check of its own, only the
// JavaScript fragments it places (`../issue.ts`), and names the locals a
// composite's parts declare.
import { VENDOR } from '@pvl/schema';
import { emitNoNewIssuesCondition, emitRootIssuePath } from '../issue.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import type {
  CheckingTarget,
  EmittedCheck,
  EmittedOutputStatement,
  EmittedShortCircuitCondition,
  EmittedVariableDeclaration,
} from './emittersTypes.js';
import type { Scope } from './scope.js';

/** A Runtime Argument as its Compiled Schema's constructor takes it. */
export type RuntimeArgumentParameter = {
  /** The field holding its value, which the checks read: `arg0`. */
  fieldName: string;
  /** The type of the parameter it is passed as: `number`. */
  type: string;
  /** What is passed for it where the `pvl.compile(...)` call was: the argument as written, or the hoisted `const` holding it. */
  passedExpression: string;
  /** The field holding the default message naming it, which the constructor builds once: its name (`arg0Message`) and the message's expression, in terms of the parameter. `undefined` when no default message names it. */
  messageField: { fieldName: string; expression: string } | undefined;
};

/** What {@link Frame.composeSchema} writes a Compiled Schema's class expression for, around the root's checks. */
export type ComposeSchemaArgs = {
  className: string;
  /** The Schema's `Input` and `Output` types, the `PvlSchema` type arguments the class implements. */
  types: SchemaTypes;
  /** The whitespace the line its `pvl.compile(...)` call is on starts with, which every line of the class after its first is indented by. */
  indentation: string;
  /** Its Runtime Arguments, in the order its constructor takes them. */
  runtimeArguments: ReadonlyArray<RuntimeArgumentParameter>;
};

/** What a {@link Frame} is created for: a Schema at its target, numbering its locals from `scope`. */
export type FrameOptions = {
  /** The Schema's value and its paths, as its parent hands them on, or `Frame.rootCheckingTarget` at the root. */
  target: CheckingTarget;
  /** Numbers a composite's locals. */
  scope: Scope;
  /** Whether it is a composite, holding other Schemas, whose checks build an output that replaces its value, declaring locals for it. */
  isComposite: boolean;
};

// The names of a Compiled Schema's `_validate` parameters, which a root
// frame checks: the value, and the path its Issues are reported at.
const VALIDATE_VALUE_PARAMETER_NAME = 'value' as const;
const VALIDATE_PATH_PARAMETER_NAME = 'path' as const;

// `_validate`'s parameter list, as the `Schema` type declares it.
const VALIDATE_PARAMETERS =
  `${VALIDATE_VALUE_PARAMETER_NAME}: unknown, ${VALIDATE_PATH_PARAMETER_NAME}: ReadonlyArray<PropertyKey>` as const;

// `_validate`'s closing return, its Result: the Issues its checks collected,
// when there are any, or else its value parameter, which a composite's checks
// replaced with the output they built. The shorthand names the Result's
// `value` key after that parameter.
const VALIDATE_RETURN_STATEMENT =
  `return issues.length > 0 ? { issues } : { ${VALIDATE_VALUE_PARAMETER_NAME} };` as const;

/** What {@link Frame.createNestedCheckingTarget} creates a nested Schema's target from: its value and its path, as expressions. */
export type CreateNestedCheckingTargetArgs = {
  value: string;
  path: string;
};

/**
 * Where a Schema's checks are composed, a builder its Emitter sets each part
 * on before composing them. Only the base check is required, and a second
 * `setBaseCheck` overwrites it; every `add…` part defaults to none, and
 * appends. It also names the locals a composite's parts declare for the
 * output they build, numbered from `scope` (`input1`, `output1`), so they
 * never clash with its parent's or its children's, at the root as nested.
 * A composite keeps its path in one (`path1`), so its children's paths stay
 * as short at any depth. A Schema that builds no output takes no number and
 * has no locals: reading one throws, which is a bug in an emitter, never a
 * user error.
 *
 * ```ts
 * new Frame({ target: Frame.rootCheckingTarget, scope, isComposite: true })
 * // { checkingTarget: { value: 'value', path: 'path', issuePath: 'path.length > 0 ? path : undefined' }, inputVariableName: 'input1', outputVariableName: 'output1', pathVariableName: 'path1', … }
 * new Frame({ target: { value: 'field0', path: '[...path1, "user"]', issuePath: '[...path1, "user"]' }, scope, isComposite: true })
 * // { inputVariableName: 'input2', outputVariableName: 'output2', pathVariableName: 'path2', … }
 * new Frame({ target: { value: 'field1', path: '[...path1, "name"]', issuePath: '[...path1, "name"]' }, scope, isComposite: false })
 * // { checkingTarget: { value: 'field1', … }, … }: `scope` numbers nothing, and `.inputVariableName` throws
 * ```
 */
export class Frame {
  /**
   * What the root of a Compiled Schema is checked at: `_validate`'s own
   * parameters, which `composeSchema` declares. Its fields' and elements'
   * paths extend its `path`, and an Issue about the value itself is
   * reported at no path when `path` is empty, as `@pvl/schema`'s own `Issue`
   * reports one. A composite at the root puts its output back on `value`, as
   * a nested one does on the value its parent reads.
   */
  public static readonly rootCheckingTarget: CheckingTarget = {
    value: VALIDATE_VALUE_PARAMETER_NAME,
    path: VALIDATE_PATH_PARAMETER_NAME,
    issuePath: emitRootIssuePath(VALIDATE_PATH_PARAMETER_NAME),
  };

  /** The Schema's value and its paths, as its parent hands them on, or `Frame.rootCheckingTarget` at the root. Every Issue about the Schema itself, its base check's and its post-modifiers', is reported at its `issuePath`. */
  public readonly checkingTarget: CheckingTarget;

  private readonly isComposite: boolean;

  // What a composite's locals end in: '1', '2', …; `undefined` for a Schema
  // that isn't a composite, so has none.
  private readonly localSuffix: string | undefined;

  private readonly shortCircuitConditions: EmittedShortCircuitCondition[] = [];
  private baseCheck?: EmittedCheck;
  private readonly postModifierChecks: EmittedCheck[] = [];

  private readonly variableDeclarations: EmittedVariableDeclaration[] = [];
  private readonly childChecks: string[] = [];
  private readonly outputStatements: EmittedOutputStatement[] = [];

  /** A frame for the Schema at `target`, numbering its locals from `scope` when it is a composite. */
  public constructor({ target, scope, isComposite }: FrameOptions) {
    this.checkingTarget = target;
    this.isComposite = isComposite;
    this.localSuffix = isComposite ? scope.nextLocalSuffix() : undefined;
  }

  /** A local original input variable - scoped across frames, same suffix in one frame (using Scope class) - `input1`, `input2`, … */
  public get inputVariableName(): string {
    return this.nameLocal('input');
  }

  /** A local original output variable - scoped across frames, same suffix in one frame (using Scope class) - `output1`, `output2`, … */
  public get outputVariableName(): string {
    return this.nameLocal('output');
  }

  /** A local original array index variable - scoped across frames, same suffix in one frame (using Scope class) - `index1`, `index2`, … */
  public get indexVariableName(): string {
    return this.nameLocal('index');
  }

  /** A local original array element (for element's schema) - scoped across frames, same suffix in one frame (using Scope class) - `element1`, `element2`, … */
  public get elementVariableName(): string {
    return this.nameLocal('element');
  }

  /** A local original path variable - scoped across frames, same suffix in one frame (using Scope class) - `path1`, `path2`, … */
  public get pathVariableName(): string {
    return this.nameLocal('path');
  }

  /** A local original issueCount variable - scoped across frames, same suffix in one frame (using Scope class) - `issueCount1`, `issueCount2`, … */
  public get issueCountVariableName(): string {
    return this.nameLocal('issueCount');
  }

  /**
   * The target a composite hands one of its fields or its element on at:
   * an Issue about it is reported at its `path`, which, unlike the root's,
   * is never empty.
   *
   * ```ts
   * Frame.createNestedCheckingTarget({ value: 'field0', path: '[...path1, "name"]' })
   * // { value: 'field0', path: '[...path1, "name"]', issuePath: '[...path1, "name"]' }
   * ```
   */
  public static createNestedCheckingTarget({
    value,
    path,
  }: CreateNestedCheckingTargetArgs): CheckingTarget {
    return { value, path, issuePath: path };
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
   * The rest goes in the base check's `else`, so it runs only once that
   * check has passed, reading the value as the type it checked. The checks
   * never return, at the root as nested, where a return would skip the
   * parent's other fields: a value a pre-modifier accepts is left as it is,
   * and a composite's output is put back on its value. Throws when no base
   * check was set, which is a bug in an emitter, never a user error.
   *
   * ```ts
   * <frame of value, at the root, shortCircuitConditions: ['value === undefined'], baseCheck: 'if (typeof value !== "string") { … }', postModifierChecks: ['if (value.length > 2) { … }']>.composeChecks()
   * // 'if (!((value === undefined))) {\n  if (typeof value !== "string") {\n    …\n  } else {\n    if (value.length > 2) { … }\n  }\n}'
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

    const checks =
      statements.length === 0
        ? baseCheck
        : Frame.composeBlock({
            head: `${baseCheck} else`,
            body: statements.join('\n'),
          });

    if (this.shortCircuitConditions.length === 0) {
      return checks;
    }

    // Any one condition holding skips every check, so they run only when none does.
    const shortCircuits = this.shortCircuitConditions
      .map((shortCircuitCondition) => `(${shortCircuitCondition})`)
      .join(' || ');

    return Frame.composeBlock({
      head: `if (!(${shortCircuits}))`,
      body: checks,
    });
  }

  /**
   * The Compiled Schema, as the expression its `pvl.compile(...)` call is
   * replaced by: an instance of a class expression implementing `PvlSchema`
   * (see `COMPILED_SCHEMA_IMPORT`) on its own, cast up to that type so it
   * types as `pvl.compile()` does. Its constructor, when it has Runtime
   * Arguments, takes each one's value, which is passed where the call was,
   * evaluated there once (ADR-0030), and builds each default message naming
   * one into a field of its own, once. Its `_validate` collects its Issues,
   * runs the checks `composeChecks` composes, at `Frame.rootCheckingTarget`
   * as this frame must be, and then returns its Result, and its `validate` and
   * `"~standard"` call it. Every line of the class after its first is
   * indented by `indentation`, and a passed argument is written as it is.
   * Throws when no base check was set, which is a bug in an emitter, never a
   * user error.
   *
   * ```ts
   * <frame of value, at the root>.composeSchema({ className: 'PvlCompiledSchema0', types: { input: 'string', output: 'string' }, indentation: '', runtimeArguments: [{ fieldName: 'arg0', type: 'number', passedExpression: 'max', messageField: { fieldName: 'arg0Message', expression: '`String must contain at most ${arg0} character(s)`' } }] })
   * // (new (class PvlCompiledSchema0 implements PvlSchema<string, string> {
   * //   declare readonly [PVL_SCHEMA_BRAND]: true;
   * //
   * //   readonly arg0Message: string;
   * //
   * //   constructor(readonly arg0: number) {
   * //     this.arg0Message = `String must contain at most ${arg0} character(s)`;
   * //   }
   * //
   * //   get "~standard"(): PvlStandardSchemaProps<string, string> {
   * //     return { version: 1, vendor: "@pvl/schema", types: undefined, validate: (value: unknown) => this.validate(value) };
   * //   }
   * //
   * //   validate(value: unknown): PvlResult<string> {
   * //     return this._validate(value, []) as PvlResult<string>;
   * //   }
   * //
   * //   _validate(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
   * //     const issues: PvlIssue[] = [];
   * //     …
   * //     return issues.length > 0 ? { issues } : { value };
   * //   }
   * // })(max) as PvlSchema<string, string>)
   * ```
   */
  // The cast is an upcast, as the class implements `PvlSchema`: it keeps the
  // Compiled Schema's type what `pvl.compile()` returns, and no anonymous
  // class type reaches a declaration file. The parentheses let a
  // `.validate(…)` read off the call site still apply to the whole of it.
  // Each field is `readonly` but not `private`, so one a method that doesn't
  // compile to a check takes (`.strict()` before `.passthrough()`), or a
  // default message a custom one replaces (`.max(max, { message: 'long' })`),
  // is no unused private member.
  public composeSchema({
    className,
    types: { input, output },
    indentation,
    runtimeArguments,
  }: ComposeSchemaArgs): string {
    const schemaType = `PvlSchema<${input}, ${output}>`;

    const messageFields = runtimeArguments.flatMap(({ messageField }) =>
      messageField === undefined ? [] : [messageField],
    );
    const constructorHead = `constructor(${runtimeArguments.map(({ fieldName, type }) => `readonly ${fieldName}: ${type}`).join(', ')})`;

    const members = [
      'declare readonly [PVL_SCHEMA_BRAND]: true;',
      ...(messageFields.length > 0
        ? [messageFields.map(({ fieldName }) => `readonly ${fieldName}: string;`).join('\n')]
        : []),
      ...(runtimeArguments.length === 0
        ? []
        : messageFields.length === 0
          ? [`${constructorHead} {}`]
          : [
              Frame.composeBlock({
                head: constructorHead,
                body: messageFields
                  .map(({ fieldName, expression }) => `this.${fieldName} = ${expression};`)
                  .join('\n'),
              }),
            ]),
      Frame.composeBlock({
        head: `get "~standard"(): PvlStandardSchemaProps<${input}, ${output}>`,
        // `types` as the interpreted path writes it: a phantom, `undefined` at runtime.
        body: `return { version: 1, vendor: ${JSON.stringify(VENDOR)}, types: undefined, validate: (${VALIDATE_VALUE_PARAMETER_NAME}: unknown) => this.validate(${VALIDATE_VALUE_PARAMETER_NAME}) };`,
      }),
      Frame.composeBlock({
        head: `validate(${VALIDATE_VALUE_PARAMETER_NAME}: unknown): PvlResult<${output}>`,
        body: `return this._validate(${VALIDATE_VALUE_PARAMETER_NAME}, []) as PvlResult<${output}>;`,
      }),
      Frame.composeBlock({
        head: `_validate(${VALIDATE_PARAMETERS}): PvlResult<unknown>`,
        body: [
          'const issues: PvlIssue[] = [];',
          this.composeChecks(),
          VALIDATE_RETURN_STATEMENT,
        ].join('\n'),
      }),
    ];
    const classExpression = Frame.indentContinuationLines(
      Frame.composeBlock({
        head: `class ${className} implements ${schemaType}`,
        body: members.join('\n\n'),
      }),
      indentation,
    );
    const passedExpressions = runtimeArguments
      .map(({ passedExpression }) => passedExpression)
      .join(', ');

    return `(new (${classExpression})(${passedExpressions}) as ${schemaType})`;
  }

  /**
   * `text` with every line after its first indented by `indentation`, so a
   * multi-line expression written where a line is indented lines up with it.
   * An empty line stays empty.
   *
   * ```ts
   * Frame.indentContinuationLines('class A {\n  m() {}\n}', '    ')
   * // 'class A {\n      m() {}\n    }'
   * ```
   */
  private static indentContinuationLines(text: string, indentation: string): string {
    return text
      .split('\n')
      .map((line, index) => (index === 0 || line === '' ? line : `${indentation}${line}`))
      .join('\n');
  }

  /**
   * The post-modifiers' checks, behind the gate they need: a post-modifier
   * runs only once the type check has (ADR-0010), and a composite's type
   * check includes its children.
   *
   * A composite's run inside `if (issues.length === issueCount1)`: an
   * unchanged Issue count means no child added an Issue. It compares with
   * the count taken before the children (which `Emitter.emitDeclarations`
   * declares), not with 0, as the one `issues` array may already hold the
   * parent's Issues. Those of a Schema with no children are written as they
   * are, as the base check's `else` already guards them.
   *
   * ```ts
   * <composite, postModifierChecks: ['if (field0.length > 3) { … }']> // ['if (issues.length === issueCount2) {\n  if (field0.length > 3) { … }\n}']
   * <composite, postModifierChecks: []>                              // []
   * <leaf, postModifierChecks: ['if (field0.length > 2) { … }']>     // ['if (field0.length > 2) { … }']
   * ```
   */
  private composePostModifierChecks(): string[] {
    const postModifierChecks = this.postModifierChecks;
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
   * <frame of field0, nested composite>.nameLocal('input') // 'input2'
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
