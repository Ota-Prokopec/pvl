// Where one Schema's checks are composed. Its Emitter emits every part as
// source text (`SchemaParts`: the base check, the pre-modifiers' parts, the
// post-modifiers' checks, the transform, and a composite's locals,
// declarations, children's checks and output statements), and the Frame's
// pure functions compose them, placing each part behind the gate it needs,
// the same at the root of a Compiled Schema's `_validate` as nested in a
// parent: the root is checked at `_validate`'s own parameters
// (`Frame.rootCheckingTarget`), as a nested Schema is at the target its
// parent hands on (`Frame.createNestedCheckingTarget`). At the root it also
// wraps the checks in the Compiled Schema's class expression, which replaces
// its `pvl.compile(...)` call, and closes `_validate` with its one return. A
// Frame writes no check of its own, only the JavaScript fragments it places:
// a composite's path and Issue-count locals, the gate behind them
// (`../issue.ts`), the pre-modifiers' guards, the transform's gate, and the
// handoff of its output.
import { VENDOR } from '@pvl/schema';
import { emitNoNewIssuesCondition, emitRootIssuePath } from '../issue.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import type {
  CheckingTarget,
  CompositeParts,
  EmittedCheck,
  EmittedCoercion,
  EmittedShortCircuitCondition,
  PreModifierStep,
  SchemaParts,
} from './emittersTypes.js';
import { composeBlock, js } from './emitterUtils.js';

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

/** What {@link Frame.composeChecks} composes: one Schema's parts, emitted at its target. */
export type ComposeChecksArgs = {
  /** The Schema's value and its paths, as its parent hands them on, or `Frame.rootCheckingTarget` at the root. */
  target: CheckingTarget;
  parts: SchemaParts;
};

/** What {@link Frame.composeSchema} writes a Compiled Schema's class expression for, around the root's checks. */
export type ComposeSchemaArgs = {
  className: string;
  /** The Schema's `Input` and `Output` types, the `PvlSchema` type arguments the class implements. */
  types: SchemaTypes;
  /** The type parameters it is generic in, which its `types` and its Runtime Arguments' may name: `.transform()`'s output, `TArg0Output`. */
  typeParameters: ReadonlyArray<string>;
  /** The whitespace the line its `pvl.compile(...)` call is on starts with, which every line of the class after its first is indented by. */
  indentation: string;
  /** Its Runtime Arguments, in the order its constructor takes them. */
  runtimeArguments: ReadonlyArray<RuntimeArgumentParameter>;
  /** The root Schema's parts, emitted at `Frame.rootCheckingTarget`. */
  parts: SchemaParts;
};

/** What {@link Frame.groupPreModifierSteps} groups: a Schema's pre-modifiers' parts. */
export type GroupPreModifierStepsArgs = {
  steps: ReadonlyArray<PreModifierStep>;
};

/** A Schema's pre-modifier step as grouped: a conversion, which replaces the value before what follows it, or the conditions chained one after another, whose one guard what follows runs behind. */
export type GroupedPreModifierStep =
  { coercion: EmittedCoercion } | { conditions: EmittedShortCircuitCondition[] };

/** What {@link Frame.createNestedCheckingTarget} creates a nested Schema's target from: its value and its path, as expressions. */
export type CreateNestedCheckingTargetArgs = {
  value: string;
  path: string;
};

/** What {@link Frame.composeCompositeStatements} composes: a composite's parts, besides its base check and its pre-modifiers' parts, at its target. */
export type ComposeCompositeStatementsArgs = {
  target: CheckingTarget;
  postModifierChecks: ReadonlyArray<EmittedCheck>;
  composite: CompositeParts;
};

// The names of a Compiled Schema's `_validate` parameters, which the root is
// checked at: the value, and the path its Issues are reported at.
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

/**
 * Where a Schema's checks are composed: pure functions of the parts its
 * Emitter emits (`SchemaParts`) and the target they were emitted at. A
 * composite's parts carry its locals, numbered from `Scope` before any
 * Schema nested in it, so they never clash with its parent's or its
 * children's; a Schema that isn't a composite has none.
 *
 * ```ts
 * Frame.composeChecks({ target: { value: 'field0', path: '[...path1, "name"]', issuePath: '[...path1, "name"]' }, parts: <the parts of pvl.string().min(3)> })
 * // 'if (typeof field0 !== "string") {\n  …\n} else {\n  if (field0.length < 3) { … }\n}'
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
   * One Schema's checks at `target`, as statements: its base check, then,
   * in its `else`, a composite's declarations, its children's checks, its
   * output statements, and its post-modifiers' checks behind their gate,
   * all after its pre-modifiers' parts (`groupPreModifierSteps`), and
   * then its transform, which runs unless one of those reported an Issue.
   * What follows a short-circuit condition runs only when it doesn't hold,
   * the value it holds for being accepted as it is, so the guard of the
   * conditions chained one after another negates any of them holding.
   *
   * The rest goes in the base check's `else`, so it runs only once that
   * check has passed, reading the value as the type it checked. The checks
   * never return, at the root as nested, where a return would skip the
   * parent's other fields: a value a pre-modifier accepts is left as it is,
   * and a composite's output is put back on its value.
   *
   * ```ts
   * Frame.composeChecks({ target: Frame.rootCheckingTarget, parts: { preModifierSteps: [{ shortCircuitCondition: 'value === undefined' }], baseCheck: 'if (typeof value !== "string") { … }', postModifierChecks: ['if (value.length > 2) { … }'] } })
   * // 'if (!((value === undefined))) {\n  if (typeof value !== "string") {\n    …\n  } else {\n    if (value.length > 2) { … }\n  }\n}'
   * Frame.composeChecks({ target: <field0, nested>, parts: { preModifierSteps: [], baseCheck: 'if (typeof field0 !== "string") { … }', postModifierChecks: ['if (field0.length < 3) { … }'] } })
   * // 'if (typeof field0 !== "string") {\n  …\n} else {\n  if (field0.length < 3) { … }\n}'
   * ```
   */
  public static composeChecks({
    target,
    parts: { baseCheck, preModifierSteps, postModifierChecks, composite, transform },
  }: ComposeChecksArgs): string {
    const statements =
      composite === undefined
        ? postModifierChecks
        : Frame.composeCompositeStatements({ target, postModifierChecks, composite });

    const checks =
      statements.length === 0
        ? baseCheck
        : composeBlock({
            head: `${baseCheck} else`,
            body: statements.join('\n'),
          });

    const guardedChecks = Frame.groupPreModifierSteps({ steps: preModifierSteps }).reduceRight(
      (body, step) =>
        'coercion' in step
          ? [step.coercion, body].join('\n')
          : composeBlock({
              head: `if (!(${step.conditions.map((condition) => `(${condition})`).join(' || ')}))`,
              body,
            }),
      checks,
    );
    if (transform === undefined) {
      return guardedChecks;
    }
    // A transform runs after a short-circuit too, but only once nothing failed.
    return [
      js`const ${transform.issueCount} = issues.length;`,
      guardedChecks,
      composeBlock({
        head: `if (${emitNoNewIssuesCondition(transform.issueCount)})`,
        body: transform.statement,
      }),
    ].join('\n');
  }

  /**
   * Whether the checks composed from `parts` replace the value they read,
   * so it is declared with `let`: a composite puts its output back on it, a
   * conversion converts it, and a transform replaces it.
   *
   * ```ts
   * Frame.replacesValue(<the parts of pvl.string().min(3)>)             // false
   * Frame.replacesValue(<the parts of pvl.string().coerce()>)           // true
   * Frame.replacesValue(<the parts of pvl.array(pvl.string())>)         // true
   * Frame.replacesValue(<the parts of pvl.string().transform(trim)>)    // true
   * ```
   */
  public static replacesValue({ composite, transform, preModifierSteps }: SchemaParts): boolean {
    return (
      composite !== undefined ||
      transform !== undefined ||
      preModifierSteps.some((step) => 'coercion' in step)
    );
  }

  /**
   * `steps`, a Schema's pre-modifiers' parts, in chain order, as ADR-0010
   * runs them: a conversion replaces the value before what follows it, and
   * conditions chained one after another are grouped, to share one guard,
   * as any one of them holding skips the rest. `composeChecks` wraps the
   * checks in them.
   *
   * ```ts
   * Frame.groupPreModifierSteps({ steps: [{ shortCircuitCondition: 'field0 === null' }, { shortCircuitCondition: 'field0 === undefined' }] })
   * // [{ conditions: ['field0 === null', 'field0 === undefined'] }]
   * Frame.groupPreModifierSteps({ steps: [{ coercion: 'field0 = String(field0);' }, { shortCircuitCondition: 'field0 === undefined' }] })
   * // [{ coercion: 'field0 = String(field0);' }, { conditions: ['field0 === undefined'] }]
   * ```
   */
  private static groupPreModifierSteps({
    steps,
  }: GroupPreModifierStepsArgs): GroupedPreModifierStep[] {
    const [step] = steps;
    if (step === undefined) {
      return [];
    }
    if ('coercion' in step) {
      return [step, ...Frame.groupPreModifierSteps({ steps: steps.slice(1) })];
    }
    const coercionIndex = steps.findIndex((nextStep) => 'coercion' in nextStep);
    const conditionCount = coercionIndex === -1 ? steps.length : coercionIndex;
    const conditions = steps
      .slice(0, conditionCount)
      .flatMap((conditionStep) =>
        'shortCircuitCondition' in conditionStep ? [conditionStep.shortCircuitCondition] : [],
      );
    return [{ conditions }, ...Frame.groupPreModifierSteps({ steps: steps.slice(conditionCount) })];
  }

  /**
   * The Compiled Schema, as the expression its `pvl.compile(...)` call is
   * replaced by: an instance of a class expression implementing `PvlSchema`
   * (see `COMPILED_SCHEMA_IMPORT`) on its own, cast up to that type so it
   * types as `pvl.compile()` does. Its constructor, when it has Runtime
   * Arguments, takes each one's value, which is passed where the call was,
   * evaluated there once (ADR-0030), and builds each default message naming
   * one into a field of its own, once. Its `_validate` collects its Issues,
   * runs the checks `composeChecks` composes from `parts` at
   * `Frame.rootCheckingTarget`, and then returns its Result, and its
   * `validate` and `"~standard"` call it. Every line of the class after its
   * first is indented by `indentation`, and a passed argument is written as
   * it is.
   *
   * ```ts
   * Frame.composeSchema({ className: 'PvlCompiledSchema0', types: { input: { text: 'string', undefinedness: 'NEVER' }, output: <the same> }, indentation: '', runtimeArguments: [{ fieldName: 'arg0', type: 'number', passedExpression: 'max', messageField: { fieldName: 'arg0Message', expression: '`String must contain at most ${arg0} character(s)`' } }], parts: <the parts of pvl.string().max(max) at the root> })
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
  // class type reaches a declaration file. A Compiled Schema generic in a
  // `.transform()`'s output is built by a generic arrow function instead,
  // whose return type is the upcast, so that output can be inferred. The parentheses let a
  // `.validate(…)` read off the call site still apply to the whole of it.
  // Each field is `readonly` but not `private`, so one a method that doesn't
  // compile to a check takes (`.strict()` before `.passthrough()`), or a
  // default message a custom one replaces (`.max(max, { message: 'long' })`),
  // is no unused private member.
  public static composeSchema({
    className,
    types: {
      input: { text: input },
      output: { text: output },
    },
    typeParameters,
    indentation,
    runtimeArguments,
    parts,
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
              composeBlock({
                head: constructorHead,
                body: messageFields
                  .map(({ fieldName, expression }) => `this.${fieldName} = ${expression};`)
                  .join('\n'),
              }),
            ]),
      composeBlock({
        head: `get "~standard"(): PvlStandardSchemaProps<${input}, ${output}>`,
        // `types` as the interpreted path writes it: a phantom, `undefined` at runtime.
        body: `return { version: 1, vendor: ${JSON.stringify(VENDOR)}, types: undefined, validate: (${VALIDATE_VALUE_PARAMETER_NAME}: unknown) => this.validate(${VALIDATE_VALUE_PARAMETER_NAME}) };`,
      }),
      composeBlock({
        head: `validate(${VALIDATE_VALUE_PARAMETER_NAME}: unknown): PvlResult<${output}>`,
        body: `return this._validate(${VALIDATE_VALUE_PARAMETER_NAME}, []) as PvlResult<${output}>;`,
      }),
      composeBlock({
        head: `_validate(${VALIDATE_PARAMETERS}): PvlResult<unknown>`,
        body: [
          'const issues: PvlIssue[] = [];',
          Frame.composeChecks({ target: Frame.rootCheckingTarget, parts }),
          VALIDATE_RETURN_STATEMENT,
        ].join('\n'),
      }),
    ];
    const classExpression = Frame.indentContinuationLines(
      composeBlock({
        head: `class ${className} implements ${schemaType}`,
        body: members.join('\n\n'),
      }),
      indentation,
    );
    const passedExpressions = runtimeArguments
      .map(({ passedExpression }) => passedExpression)
      .join(', ');

    if (typeParameters.length === 0) {
      return `(new (${classExpression})(${passedExpressions}) as ${schemaType})`;
    }
    // A generic arrow function, whose type parameters TypeScript infers from
    // the arguments it is passed, as it infers a `.transform()`'s `NewOutput`;
    // its return type is the upcast. The trailing comma keeps `<T,>` a type
    // parameter list in a `.tsx` module too.
    const parameters = runtimeArguments
      .map(({ fieldName, type }) => `${fieldName}: ${type}`)
      .join(', ');
    const fieldNames = runtimeArguments.map(({ fieldName }) => fieldName).join(', ');
    return `(<${typeParameters.join(', ')},>(${parameters}): ${schemaType} => new (${classExpression})(${fieldNames}))(${passedExpressions})`;
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
   * What a composite runs once its type check (base check) has passed, as
   * statements: the Frame's own locals, then its declarations, its
   * children's checks, its output statements, its post-modifiers' checks
   * behind their gate, which read the output its checks built, as the
   * interpreted path's post-modifiers read `_checkType`'s, and the handoff
   * of its output. Its children's checks
   * are set apart by a blank line before, between and after them when the
   * composite asks for it (`setsChildrenApart`), as an object does for its
   * fields, so the blank lines are the Frame's formatting, never a part.
   *
   * A post-modifier runs only once the type check has (ADR-0010), and a
   * composite's type check includes its children, so a composite's
   * post-modifiers run inside `if (issues.length === issueCount1)`: an
   * unchanged Issue count means no child added an Issue. It compares with
   * the count taken before the children, which is declared here, along with
   * the gate, as one `issues` array may already hold the parent's Issues.
   * The path local is there to report Issues under the composite, and only
   * checks push Issues, never a declaration or an output statement, so it
   * is declared when the composite has any: its children's, whose paths
   * extend it, or its post-modifiers', as `.strict()` reports an unknown
   * key at `[...path1, key]`. The output is put back on the value its parent
   * reads, or on `_validate`'s own `value` at the root.
   *
   * ```ts
   * Frame.composeCompositeStatements({ target: <field0 at [...path1, "tags"]>, postModifierChecks: ['if (field0.length < 1) { … }'], composite: <the composite parts of pvl.array(pvl.string()) at field0, locals ending in 2> })
   * // ['const path2 = [...path1, "tags"];', 'const issueCount2 = issues.length;', 'const output2: unknown[] = [];', 'for (…) { … }', 'if (issues.length === issueCount2) {\n  if (output2.length < 1) { … }\n}', 'field0 = output2;']
   * Frame.composeCompositeStatements({ target: Frame.rootCheckingTarget, postModifierChecks: [], composite: <the composite parts of pvl.object({}) at the root, locals ending in 1> })
   * // ['const input1 = value as Record<string, unknown>;', '', 'const output1: Record<string, unknown> = {};', 'value = output1;']
   * ```
   */
  private static composeCompositeStatements({
    target,
    postModifierChecks,
    composite: { locals, declarations, childChecks, setsChildrenApart, outputStatements },
  }: ComposeCompositeStatementsArgs): string[] {
    const hasPostModifierChecks = postModifierChecks.length > 0;
    const readsPath = childChecks.length > 0 || hasPostModifierChecks;
    return [
      ...(readsPath ? [js`const ${locals.path} = ${target.path};`] : []),
      ...(hasPostModifierChecks ? [js`const ${locals.issueCount} = issues.length;`] : []),
      ...declarations,
      ...(setsChildrenApart
        ? ['', ...childChecks.flatMap((childCheck) => [childCheck, ''])]
        : childChecks),
      ...outputStatements,
      ...(hasPostModifierChecks
        ? [
            composeBlock({
              head: `if (${emitNoNewIssuesCondition(locals.issueCount)})`,
              body: postModifierChecks.join('\n'),
            }),
          ]
        : []),
      js`${target.value} = ${locals.output};`,
    ];
  }
}
