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
// handoff of its output. The helpers reading nothing of the Frame itself
// are in `./utils.ts`.
import { VENDOR } from '@pvl/schema';
import { STANDALONE_BRAND_NAME } from '../consts/generatedModule.js';
import {
  STANDALONE_MARKER_TYPE_NAME,
  VALIDATE_PARAMETERS,
  VALIDATE_PATH_PARAMETER_NAME,
  VALIDATE_RETURN_STATEMENT,
  VALIDATE_VALUE_PARAMETER_NAME,
} from './consts.js';
import {
  composeCompositeStatements,
  groupPreModifierSteps,
  spellCompiledSchemaType,
} from './utils.js';
import {
  emitIssueCountBeforeValueValidationName,
  emitNoNewIssuesCondition,
  emitRootIssuePath,
} from '../issue.js';
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import type { RuntimeArgumentParameter } from '../schemas/runtimeArgument/types.js';
import type { CompiledSchema } from '../emitters/types/compiledSchema.js';
import type { CheckingTarget, SchemaParts } from '../emitters/types/schemaParts.js';
import type { EmittedStandaloneProperty } from '../emitters/types/standaloneProperties.js';
import { composeBlock, indentContinuationLines, js } from '../emitters/utils/js.js';

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
  /** Whether it is marked `.standalone()`, which its `_standalone` reports and its type carries the Standalone marker for. */
  isStandalone: boolean;
  /** The whitespace the line its `pvl.compile(...)` call is on starts with, which every line of the class after its first is indented by. */
  indentation: string;
  /** Its Runtime Arguments, in the order its constructor takes them. The class is generic in the type parameters they name (`.transform()`'s output, `TArg0Output`), which only a root's do: a nested class is written inside the root, where they are in scope. */
  runtimeArguments: ReadonlyArray<RuntimeArgumentParameter>;
  /** Its `shape` or marked `element`, `undefined` when it exposes neither. */
  standaloneProperty: EmittedStandaloneProperty | undefined;
  /** The Schema's parts, emitted at `Frame.rootCheckingTarget`. */
  parts: SchemaParts;
};

/** What {@link Frame.createNestedCheckingTarget} creates a nested Schema's target from: its value and its path, as expressions. */
export type CreateNestedCheckingTargetArgs = {
  value: string;
  path: string;
};

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
        : composeCompositeStatements({ target, postModifierChecks, composite });

    const checks =
      statements.length === 0
        ? baseCheck
        : composeBlock({
            head: `${baseCheck} else`,
            body: statements.join('\n'),
          });

    const guardedChecks = groupPreModifierSteps({ steps: preModifierSteps }).reduceRight(
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
    const issueCount = emitIssueCountBeforeValueValidationName(target.value);
    return [
      js`const ${issueCount} = issues.length;`,
      guardedChecks,
      composeBlock({
        head: `if (${emitNoNewIssuesCondition(issueCount)})`,
        body: transform,
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
   * The Compiled Schema: the expression its `pvl.compile(...)` call is
   * replaced by, and the type it is cast up to (`spellCompiledSchemaType`).
   * The expression is an instance of a class expression implementing
   * `PvlSchema` (see `COMPILED_SCHEMA_IMPORT`) on its own, cast up to that
   * type, so it types as `pvl.compile()` does. Its constructor, when it has
   * Runtime Arguments, takes each one's value, which is passed where the
   * call was, evaluated there once (ADR-0030), and builds each default
   * message naming one into a field of its own, once. It then builds its
   * `shape` or marked `element` (ADR-0036, ADR-0039). Its
   * `_validate` collects its Issues, runs the checks `composeChecks`
   * composes from `parts` at `Frame.rootCheckingTarget`, and then returns
   * its Result, and its `validate` and `"~standard"` call it. Its
   * `standalone()` hands back a copy reporting `_standalone`. Every line of
   * the class after its first is indented by `indentation`, and a passed
   * argument is written as it is.
   *
   * ```ts
   * Frame.composeSchema({ className: 'PvlCompiledSchema0', types: { input: { text: 'string', undefinedness: 'NEVER' }, output: <the same> }, isStandalone: false, indentation: '', runtimeArguments: [{ fieldName: 'arg0', type: 'number', passedExpression: 'max', messageField: { fieldName: 'arg0Message', expression: '`String must contain at most ${arg0} character(s)`' }, typeParameter: undefined }], standaloneProperty: undefined, parts: <the parts of pvl.string().max(max) at the root> })
   * // { type: 'PvlSchema<string, string>', expression:
   * // (new (class PvlCompiledSchema0 implements PvlSchema<string, string> {
   * //   declare readonly [PVL_SCHEMA_BRAND]: true;
   * //   readonly _standalone: boolean = false;
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
   * //
   * //   standalone(): this & PvlStandaloneMarker {
   * //     return Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this, { _standalone: true }) as unknown as this & PvlStandaloneMarker;
   * //   }
   * // })(max) as PvlSchema<string, string>) }
   * ```
   */
  // The cast is an upcast, as the class implements `PvlSchema`: it keeps the
  // Compiled Schema's type what `pvl.compile()` returns, and no anonymous
  // class type reaches a declaration file. A Compiled Schema generic in a
  // `.transform()`'s output is built by a generic arrow function instead, whose return type is the upcast, so that
  // type can be inferred. The parentheses let a `.validate(…)` read off the
  // call site still apply to the whole of it.
  // Each field is `readonly` but not `private`, so one a method that doesn't
  // compile to a check takes (`.strict()` before `.passthrough()`), or a
  // default message a custom one replaces (`.max(max, { message: 'long' })`),
  // is no unused private member.
  public static composeSchema({
    className,
    types,
    isStandalone,
    indentation,
    runtimeArguments,
    standaloneProperty,
    parts,
  }: ComposeSchemaArgs): CompiledSchema {
    const {
      input: { text: input },
      output: { text: output },
    } = types;
    const compiledSchemaType = spellCompiledSchemaType({
      types,
      isStandalone,
      shapeOrElementType: standaloneProperty?.type,
    });
    const messageFields = runtimeArguments.flatMap(({ messageField }) =>
      messageField === undefined ? [] : [messageField],
    );
    const constructorHead = `constructor(${runtimeArguments.map(({ fieldName, type }) => `readonly ${fieldName}: ${type}`).join(', ')})`;
    const constructorStatements = [
      ...messageFields.map(({ fieldName, expression }) => `this.${fieldName} = ${expression};`),
      ...(standaloneProperty?.statement === undefined ? [] : [standaloneProperty.statement]),
    ];

    const members = [
      [
        'declare readonly [PVL_SCHEMA_BRAND]: true;',
        // The marker `pvl.compile()` types a marked Schema with, as the
        // brand the Schema type requires, type-only.
        ...(isStandalone ? [`declare readonly [${STANDALONE_BRAND_NAME}]: true;`] : []),
        `readonly _standalone: boolean = ${String(isStandalone)};`,
      ].join('\n'),
      ...(standaloneProperty === undefined ? [] : [standaloneProperty.declaration]),
      ...(messageFields.length > 0
        ? [messageFields.map(({ fieldName }) => `readonly ${fieldName}: string;`).join('\n')]
        : []),
      ...(runtimeArguments.length === 0 && constructorStatements.length === 0
        ? []
        : constructorStatements.length === 0
          ? [`${constructorHead} {}`]
          : [composeBlock({ head: constructorHead, body: constructorStatements.join('\n') })]),
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
      // A copy, as `@pvl/schema`'s own `.standalone()` hands back, with its
      // own fields, the shape or element among them, and the flag set.
      composeBlock({
        head: `standalone(): this & ${STANDALONE_MARKER_TYPE_NAME}`,
        body: `return Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this, { _standalone: true }) as unknown as this & ${STANDALONE_MARKER_TYPE_NAME};`,
      }),
    ];
    const classExpression = indentContinuationLines(
      composeBlock({
        head: `class ${className} implements PvlSchema<${input}, ${output}>`,
        body: members.join('\n\n'),
      }),
      indentation,
    );
    const passedExpressions = runtimeArguments
      .map(({ passedExpression }) => passedExpression)
      .join(', ');
    // In the order their Runtime Arguments are numbered.
    const typeParameters = runtimeArguments.flatMap(({ typeParameter }) =>
      typeParameter === undefined ? [] : [typeParameter],
    );

    if (typeParameters.length === 0) {
      return {
        expression: `(new (${classExpression})(${passedExpressions}) as ${compiledSchemaType})`,
        type: compiledSchemaType,
      };
    }
    // A generic arrow function, whose type parameters TypeScript infers from
    // the arguments it is passed, as it infers a `.transform()`'s `NewOutput`;
    // its return type is the upcast. The trailing comma keeps `<T,>` a type
    // parameter list in a `.tsx` module too.
    const arrowParameters = runtimeArguments
      .map(({ fieldName, type }) => `${fieldName}: ${type}`)
      .join(', ');
    const parameterNames = runtimeArguments.map(({ fieldName }) => fieldName).join(', ');
    return {
      expression: `(<${typeParameters.join(', ')},>(${arrowParameters}): ${compiledSchemaType} => new (${classExpression})(${parameterNames}))(${passedExpressions})`,
      type: compiledSchemaType,
    };
  }
}
