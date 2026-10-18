// Where one Schema's checks are composed. Its Emitter emits each part (the
// base check, the pre-modifiers' conditions, the declarations, the children's
// checks, the post-modifiers' checks, the output statements) and hands it to
// the Schema's Frame, which only composes them, placing each part behind the
// gate the Schema's position needs: the root of a Compiled Schema's
// `_checkType`, which returns on the first Issues it can and then the value
// it checked, or a parent, which reads that value back once the checks have
// run. The root's Frame also writes the Compiled Schema's class. A Frame
// writes no check of its own, only the JavaScript fragments it places
// (`emitterUtils.ts`), and names the locals a composite's parts declare.
import type { SchemaTypes } from '../schemas/schemaTypes.js';
import type {
  EmittingCheckMethodInput,
  EmittingCheckMethodOutputWithCheck,
} from './emitterTypes.js';
import {
  emitCheck,
  emitNoNewIssuesCondition,
  emitReturnIssueIfFails,
  emitReturnIssuesIfAny,
  emitReturnValue,
} from './emitterUtils.js';
import type { Scope } from './scope.js';

const INDENT = '  ' as const;

/** The Compiled Schema a root Frame writes the class of. */
export type FrameCompiledSchema = {
  className: string;
  /** The line of the `pvl.compile()` call, named in the class's comment. */
  line: number;
  /** The Schema's `Input` and `Output` types, the class's type arguments. */
  types: SchemaTypes;
};

/** What a Frame is created for. */
export type FrameOptions = {
  /** The Schema's value and the Issue path of an Issue about it, as its parent hands them on. */
  target: EmittingCheckMethodInput;
  /** Numbers a nested Schema's locals. */
  scope: Scope;
  /** Whether its checks build an output that replaces its value, as only a composite's do, declaring locals for it. */
  buildsOutput: boolean;
  /** The Compiled Schema whose `_checkType` its checks are the body of, which makes it the root; `undefined` nested. */
  compiledSchema?: FrameCompiledSchema;
};

/** What {@link Frame.setBaseCheck} sets: the Schema's base check, the type check. */
export type FrameSetBaseCheckArgs = {
  baseCheck: EmittingCheckMethodOutputWithCheck;
};

/** What {@link Frame.addPreModifierConditions} adds: conditions the rest of the checks run under, in chain order. */
export type FrameAddPreModifierConditionsArgs = {
  preModifierConditions: ReadonlyArray<string>;
};

/** What {@link Frame.addDeclarations} adds: locals the other parts read, declared once the base check has passed. */
export type FrameAddDeclarationsArgs = {
  declarations: ReadonlyArray<string>;
};

/** What {@link Frame.addChildChecks} adds: a composite's children's checks, each inlined as its own Frame composed it. */
export type FrameAddChildChecksArgs = {
  childChecks: ReadonlyArray<string>;
};

/** What {@link Frame.addPostModifierChecks} adds: post-modifiers' checks, in chain order. */
export type FrameAddPostModifierChecksArgs = {
  postModifierChecks: ReadonlyArray<string>;
};

/** What {@link Frame.addOutputStatements} adds: statements building the output and handing it on. */
export type FrameAddOutputStatementsArgs = {
  outputStatements: ReadonlyArray<string>;
};

/** What {@link Frame.composeChecks} returns: the Schema's checks, as statements. */
export type FrameComposeChecksOutput = {
  statements: string[];
};

/** What {@link Frame.composeSchema} returns: the Compiled Schema's class declaration. */
export type FrameComposeSchemaOutput = {
  schema: string;
};

/** What {@link Frame.composeBlock} wraps: the statements of `body`, under `head`. */
export type FrameComposeBlockArgs = {
  head: string;
  body: string;
};

/**
 * Where a Schema's checks are composed, a builder its Emitter sets each part
 * on before composing them. Only the base check is required, and a second
 * `setBaseCheck` overwrites it; every `add…` part defaults to none, and
 * appends. It also names the locals a composite's parts declare for the
 * output they build. At the root, its value and path are `_checkType`'s own
 * `value` and `path`, and its locals plain (`input`, `output`). Nested, a
 * composite numbers its locals (`input1`, `output1`), so they never clash
 * with its parent's, and keeps its Issue path in one (`path1`), so its
 * children's paths stay as short at any depth. A Schema that builds no
 * output takes no number and has no locals: reading one throws, which is a
 * bug in an emitter, never a user error.
 *
 * ```ts
 * new Frame({ target: { value: 'value', issuePath: ROOT_ISSUE_PATH }, scope, buildsOutput: true, compiledSchema })
 * // { input: 'input', output: 'output', path: 'path', issuePath: ROOT_ISSUE_PATH, … }
 * new Frame({ target: { value: 'field0', issuePath: '[...path, "user"]' }, scope, buildsOutput: true })
 * // { input: 'input1', output: 'output1', path: 'path1', issuePath: 'path1', … }
 * new Frame({ target: { value: 'field1', issuePath: '[...path, "name"]' }, scope, buildsOutput: false })
 * // { issuePath: '[...path, "name"]', … }: `scope` numbers nothing, and `.input` throws
 * ```
 */
export class Frame {
  /** The Schema's value and the Issue path of an Issue about it, as its parent hands them on. */
  public readonly target: EmittingCheckMethodInput;
  /** The Issue path of an Issue about the Schema itself: `ROOT_ISSUE_PATH` at the root, `path1`, … for a nested composite. */
  public readonly issuePath: string;

  private readonly buildsOutput: boolean;
  private readonly compiledSchema: FrameCompiledSchema | undefined;
  // What a composite's locals end in: '' at the root, '1', '2', … nested;
  // `undefined` for a Schema that builds no output, so has none.
  private readonly localSuffix: string | undefined;

  private baseCheck: EmittingCheckMethodOutputWithCheck | undefined;
  private readonly preModifierConditions: string[] = [];
  private readonly declarations: string[] = [];
  private readonly childChecks: string[] = [];
  private readonly postModifierChecks: string[] = [];
  private readonly outputStatements: string[] = [];

  /** A frame for the Schema at `target`, numbering its locals from `scope` when it is nested and builds an output. */
  public constructor({ target, scope, buildsOutput, compiledSchema }: FrameOptions) {
    this.target = target;
    this.buildsOutput = buildsOutput;
    this.compiledSchema = compiledSchema;
    this.localSuffix = !buildsOutput ? undefined : this.isRoot ? '' : scope.nextLocalSuffix();
    this.issuePath = buildsOutput && !this.isRoot ? this.path : target.issuePath;
  }

  /** An object's value, read as a record: `input`, `input1`, … */
  public get input(): string {
    return this.nameLocal('input');
  }

  /** The output a composite's checks build: `output`, `output1`, … */
  public get output(): string {
    return this.nameLocal('output');
  }

  /** An array's loop index: `index`, `index1`, … */
  public get index(): string {
    return this.nameLocal('index');
  }

  /** An array's element: `element`, `element1`, … */
  public get element(): string {
    return this.nameLocal('element');
  }

  /** The path a composite's children's Issue paths extend: `_checkType`'s `path` at the root, `path1`, … nested. */
  public get path(): string {
    return this.nameLocal('path');
  }

  /** The count of Issues before a nested composite's children, which is unchanged once they have all passed: `issueCount1`, … */
  public get issueCount(): string {
    return this.nameLocal('issueCount');
  }

  /** Whether it is the Schema `pvl.compile()` wraps, composed as `_checkType`'s body: whether it has a `compiledSchema`. */
  private get isRoot(): boolean {
    return this.compiledSchema !== undefined;
  }

  /**
   * `head`, then the statements of `body` one level deeper, blank lines left
   * blank, in a block.
   *
   * ```ts
   * Frame.composeBlock({ head: 'if (ok)', body: 'run();\n\nstop();' }) // 'if (ok) {\n  run();\n\n  stop();\n}'
   * ```
   */
  public static composeBlock({ head, body }: FrameComposeBlockArgs): string {
    const indentedBody = body
      .split('\n')
      .map((line) => (line === '' ? line : `${INDENT}${line}`))
      .join('\n');
    return `${head} {\n${indentedBody}\n}`;
  }

  /** Sets the Schema's base check, the type check, over any set before. */
  public setBaseCheck({ baseCheck }: FrameSetBaseCheckArgs): void {
    this.baseCheck = baseCheck;
  }

  /** Adds conditions the rest of the checks run under, as a value a pre-modifier accepts skips them. */
  public addPreModifierConditions({
    preModifierConditions,
  }: FrameAddPreModifierConditionsArgs): void {
    this.preModifierConditions.push(...preModifierConditions);
  }

  /** Adds locals the other parts read, declared first once the base check has passed. */
  public addDeclarations({ declarations }: FrameAddDeclarationsArgs): void {
    this.declarations.push(...declarations);
  }

  /** Adds a composite's children's checks, which run after its declarations. */
  public addChildChecks({ childChecks }: FrameAddChildChecksArgs): void {
    this.childChecks.push(...childChecks);
  }

  /** Adds post-modifiers' checks, which run once the base check has passed, and every child has. */
  public addPostModifierChecks({ postModifierChecks }: FrameAddPostModifierChecksArgs): void {
    this.postModifierChecks.push(...postModifierChecks);
  }

  /** Adds statements building the output and handing it on, which run last. */
  public addOutputStatements({ outputStatements }: FrameAddOutputStatementsArgs): void {
    this.outputStatements.push(...outputStatements);
  }

  /**
   * The Schema's checks, as statements: its declarations, its children's
   * checks, its post-modifiers' checks behind their gate, and its output
   * statements, all once its base check has passed, then guarded by its
   * pre-modifiers' conditions.
   *
   * At the root, a failing base check returns its Issue, as nothing else
   * can be checked, and the rest follows it. A value a pre-modifier accepts
   * skips every check and is returned as it is, after them. Nested, the
   * checks can't return, as that would skip the parent's other fields: the
   * rest goes in the base check's `else`, and a value a pre-modifier accepts
   * is left as it is. Throws when no base check was set, which is a bug in
   * an emitter, never a user error.
   *
   * ```ts
   * <frame of value, at the root, preModifierConditions: ['value !== undefined'], baseCheck: <typeof value !== "string">, outputStatements: ['return { value };']>.composeChecks()
   * // { statements: ['if (value !== undefined) {\n  if (typeof value !== "string") { … return { issues }; }\n  return { value };\n}', 'return { value };'] }
   * <frame of field0, nested, baseCheck: <typeof field0 !== "string">, postModifierChecks: ['if (field0.length < 3) { … }']>.composeChecks()
   * // { statements: ['if (typeof field0 !== "string") {\n  …\n} else {\n  if (field0.length < 3) { … }\n}'] }
   * ```
   */
  public composeChecks(): FrameComposeChecksOutput {
    const { baseCheck } = this;
    if (baseCheck === undefined) {
      throw new Error(`The frame of \`${this.target.value}\` has no base check to compose.`);
    }
    const checkedStatements = [
      ...this.declarations,
      ...this.childChecks,
      ...this.composePostModifierChecks(),
      ...this.outputStatements,
    ];
    const checks = this.isRoot
      ? [emitReturnIssueIfFails(baseCheck), ...checkedStatements]
      : [
          checkedStatements.length === 0
            ? emitCheck(baseCheck)
            : Frame.composeBlock({
                head: `${emitCheck(baseCheck)} else`,
                body: checkedStatements.join('\n'),
              }),
        ];

    if (this.preModifierConditions.length === 0) {
      return { statements: checks };
    }
    return {
      statements: [
        Frame.composeBlock({
          head: `if (${this.preModifierConditions.join(' && ')})`,
          body: checks.join('\n'),
        }),
        // `_checkType`'s own `value`, which a pre-modifier accepted.
        ...(this.isRoot ? [emitReturnValue(this.target.value)] : []),
      ],
    };
  }

  /**
   * The Compiled Schema's class declaration, extending `PvlSchema` (see
   * `COMPILED_SCHEMA_IMPORT`), whose `_checkType` collects its Issues and
   * runs the checks `composeChecks` composes at the root. Throws for a
   * nested frame, or when no base check was set, which is a bug in an
   * emitter, never a user error.
   *
   * ```ts
   * <frame of value, at the root, compiledSchema: { className: 'PvlCompiledSchema0', line: 3, types: { input: '{ name: string }', … } }>.composeSchema()
   * // { schema: <the class, as below> }
   * // // pvl.compile() on line 3
   * // class PvlCompiledSchema0 extends PvlSchema<{ name: string }, { name: string }> {
   * //   override _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown> {
   * //     const issues: PvlIssue[] = [];
   * //     …
   * //   }
   * // }
   * ```
   */
  public composeSchema(): FrameComposeSchemaOutput {
    const { compiledSchema } = this;
    if (compiledSchema === undefined) {
      throw new Error(
        `The frame of \`${this.target.value}\` is nested, so it has no class to compose.`,
      );
    }
    const {
      className,
      line,
      types: { input, output },
    } = compiledSchema;
    const { statements } = this.composeChecks();

    return {
      schema: [
        `// pvl.compile() on line ${String(line)}`,
        Frame.composeBlock({
          head: `class ${className} extends PvlSchema<${input}, ${output}>`,
          body: Frame.composeBlock({
            head: 'override _checkType(value: unknown, path: ReadonlyArray<PropertyKey>): PvlResult<unknown>',
            body: ['const issues: PvlIssue[] = [];', ...statements].join('\n'),
          }),
        }),
      ].join('\n'),
    };
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
   * Schema with no children, the base check's return already guards them,
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
    const { postModifierChecks } = this;
    if (this.isRoot) {
      if (this.buildsOutput) {
        return postModifierChecks.length === 0
          ? [emitReturnIssuesIfAny()]
          : [emitReturnIssuesIfAny(), ...postModifierChecks, emitReturnIssuesIfAny()];
      }
      return postModifierChecks.length === 0
        ? []
        : [...postModifierChecks, emitReturnIssuesIfAny()];
    }
    if (this.buildsOutput && postModifierChecks.length > 0) {
      return [
        Frame.composeBlock({
          head: `if (${emitNoNewIssuesCondition(this.issueCount)})`,
          body: postModifierChecks.join('\n'),
        }),
      ];
    }
    return [...postModifierChecks];
  }

  /**
   * The name of a composite's local `name`, with the suffix that keeps it
   * apart from its parent's. Throws for a Schema that builds no output,
   * which has no locals.
   *
   * ```ts
   * <frame of field0, nested, building an output>.nameLocal('input') // 'input1'
   * <frame of field1, nested, building none>.nameLocal('input')       // throws
   * ```
   */
  private nameLocal(name: string): string {
    if (this.localSuffix === undefined) {
      throw new Error(`\`${this.target.value}\` builds no output, so it has no \`${name}\` local.`);
    }
    return `${name}${this.localSuffix}`;
  }
}
