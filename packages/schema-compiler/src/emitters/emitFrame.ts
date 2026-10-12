// Where a Schema's checks are inlined, and all that changes with it: the
// root of a Compiled Schema's `_checkType`, which returns on the first Issues
// it can and then the value it checked, or a parent, which reads that value
// back once the checks have run. An emitter writes a Schema's checks once,
// for both, through the locals and statements its frame hands it.
import type { EmitScope } from './emitScope.js';
import type {
  EmittingCheckMethodInput,
  EmittingCheckMethodOutputWithCheck,
} from './emitterTypes.js';
import { emitBlock, emitCheck, js } from './emitterUtils.js';

/** What an EmitFrame is created for. */
export type EmitFrameOptions = {
  /** The Schema's value and the Issue path of an Issue about it, as its parent hands them on. */
  target: EmittingCheckMethodInput;
  /** Numbers a nested Schema's locals. */
  scope: EmitScope;
  /** Whether it is the Schema `pvl.compile()` wraps, emitted as `_checkType`'s body. */
  isRoot: boolean;
  /** Whether its checks build an output that replaces its value, as only a composite's do, declaring locals for it. */
  buildsOutput: boolean;
};

/** What {@link EmitFrame.emitChecks} places: one Schema's checks, as its Emitter writes them. */
export type EmitFrameChecksArgs = {
  /** Its pre-modifiers' conditions, which the rest of its checks run under. */
  preModifierConditions: ReadonlyArray<string>;
  /** Its base check, the type check. */
  baseCheck: EmittingCheckMethodOutputWithCheck;
  /** What is checked once the base check has passed. */
  typedChecks: ReadonlyArray<string>;
};

/** What {@link EmitFrame.emitOnceBaseCheckPassed} and {@link EmitFrame.emitOnceChildrenPassed} place: a Schema's post-modifier checks. */
export type EmitPostModifierChecksArgs = {
  postModifierChecks: ReadonlyArray<string>;
};

/** What {@link EmitFrame.emitDeclarations} declares a nested composite's locals for. */
export type EmitDeclarationsArgs = EmitPostModifierChecksArgs & {
  /** Whether its checks read its path, to report at it or extend it. */
  readsPath: boolean;
};

/**
 * The statement returning the Issues collected so far, if there are any.
 *
 * ```ts
 * emitReturnIssuesIfAny() // 'if (issues.length > 0) {\n  return { issues };\n}'
 * ```
 */
const emitReturnIssuesIfAny = (): string => {
  return emitBlock({ head: 'if (issues.length > 0)', body: 'return { issues };' });
};

/**
 * `check` returning its Issue when it fails: the root's base check, after
 * which nothing else can be checked.
 *
 * ```ts
 * emitReturnIssueIfFails({ failsWhen: '!Array.isArray(value)', issue: '{ … }' })
 * // 'if (!Array.isArray(value)) {\n  issues.push({ … });\n  return { issues };\n}'
 * ```
 */
const emitReturnIssueIfFails = ({
  failsWhen,
  issue,
}: EmittingCheckMethodOutputWithCheck): string => {
  return emitBlock({
    head: js`if (${failsWhen})`,
    body: js`issues.push(${issue});` + '\nreturn { issues };',
  });
};

/**
 * Where a Schema's checks are inlined, and the names of the locals a
 * composite's checks declare for the output they build. At the root, its
 * value and path are `_checkType`'s own `value` and `path`, and its locals
 * plain (`input`, `output`). Nested, a composite numbers its locals
 * (`input1`, `output1`), so they never clash with its parent's, and keeps
 * its Issue path in one (`path1`), so its children's paths stay as short at
 * any depth. A Schema that builds no output takes no number and has no
 * locals: reading one throws, which is a bug in an emitter, never a user
 * error.
 *
 * ```ts
 * new EmitFrame({ target: { value: 'value', issuePath: ROOT_ISSUE_PATH }, scope, isRoot: true, buildsOutput: true })
 * // { input: 'input', output: 'output', path: 'path', issuePath: ROOT_ISSUE_PATH, … }
 * new EmitFrame({ target: { value: 'field0', issuePath: '[...path, "user"]' }, scope, isRoot: false, buildsOutput: true })
 * // { input: 'input1', output: 'output1', path: 'path1', issuePath: 'path1', … }
 * new EmitFrame({ target: { value: 'field1', issuePath: '[...path, "name"]' }, scope, isRoot: false, buildsOutput: false })
 * // { issuePath: '[...path, "name"]', … }: `scope` numbers nothing, and `.input` throws
 * ```
 */
export class EmitFrame {
  /** The Schema's value and the Issue path of an Issue about it, as its parent hands them on. */
  public readonly target: EmittingCheckMethodInput;
  /** The Issue path of an Issue about the Schema itself: `ROOT_ISSUE_PATH` at the root, `path1`, … for a nested composite. */
  public readonly issuePath: string;

  private readonly isRoot: boolean;
  private readonly buildsOutput: boolean;
  // What a composite's locals end in: '' at the root, '1', '2', … nested;
  // `undefined` for a Schema that builds no output, so has none.
  private readonly localSuffix: string | undefined;

  /** A frame for the Schema at `target`, numbering its locals from `scope` when it is nested and builds an output. */
  public constructor({ target, scope, isRoot, buildsOutput }: EmitFrameOptions) {
    this.target = target;
    this.isRoot = isRoot;
    this.buildsOutput = buildsOutput;
    this.localSuffix = !buildsOutput ? undefined : isRoot ? '' : scope.nextLocalSuffix();
    this.issuePath = buildsOutput && !isRoot ? this.path : target.issuePath;
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

  // The count of Issues before a composite's children, which is unchanged
  // once they have all passed: `issueCount1`, …
  private get issueCount(): string {
    return this.nameLocal('issueCount');
  }

  /**
   * One Schema's checks, as statements: its base check, then what runs once
   * that has passed, then its output handed on, all guarded by its
   * pre-modifiers' conditions.
   *
   * At the root, a failing base check returns its Issue, as nothing else
   * can be checked. A value a pre-modifier accepts skips every check and is
   * returned as it is, after them. Nested, the checks can't return, as that
   * would skip the parent's other fields: what runs once the base check has
   * passed goes in its `else`, and a value a pre-modifier accepts is left as
   * it is.
   *
   * ```ts
   * <frame of value, at the root>.emitChecks({ preModifierConditions: ['value !== undefined'], baseCheck: <typeof value !== "string">, typedChecks: [] })
   * // ['if (value !== undefined) {\n  if (typeof value !== "string") { … return { issues }; }\n  return { value };\n}', 'return { value };']
   * <frame of field0, nested>.emitChecks({ preModifierConditions: [], baseCheck: <typeof field0 !== "string">, typedChecks: ['if (field0.length < 3) { … }'] })
   * // ['if (typeof field0 !== "string") {\n  …\n} else {\n  if (field0.length < 3) { … }\n}']
   * ```
   */
  public emitChecks({
    preModifierConditions,
    baseCheck,
    typedChecks,
  }: EmitFrameChecksArgs): string[] {
    const checkedStatements = [...typedChecks, ...this.emitOutputHandoff()];
    const checks = this.isRoot
      ? [emitReturnIssueIfFails(baseCheck), ...checkedStatements]
      : [
          checkedStatements.length === 0
            ? emitCheck(baseCheck)
            : emitBlock({
                head: `${emitCheck(baseCheck)} else`,
                body: checkedStatements.join('\n'),
              }),
        ];

    if (preModifierConditions.length === 0) {
      return checks;
    }
    return [
      emitBlock({ head: `if (${preModifierConditions.join(' && ')})`, body: checks.join('\n') }),
      // `_checkType`'s own `value`, which a pre-modifier accepted.
      ...(this.isRoot ? ['return { value };'] : []),
    ];
  }

  /**
   * The post-modifier checks of a Schema with no children (`.min(3)`),
   * placed once its base check has passed. At the root, the Issues they
   * push are returned before its value is. Nested, they are written as they
   * are, as the base check's `else` already guards them.
   *
   * ```ts
   * <frame at the root>.emitOnceBaseCheckPassed({ postModifierChecks: ['if (value.length > 2) { … }'] })
   * // ['if (value.length > 2) { … }', 'if (issues.length > 0) { … }']
   * <frame at the root>.emitOnceBaseCheckPassed({ postModifierChecks: [] }) // []
   * <frame of field0, nested>.emitOnceBaseCheckPassed({ postModifierChecks: ['if (field0.length > 2) { … }'] })
   * // ['if (field0.length > 2) { … }']
   * ```
   */
  public emitOnceBaseCheckPassed({ postModifierChecks }: EmitPostModifierChecksArgs): string[] {
    return this.isRoot && postModifierChecks.length > 0
      ? [...postModifierChecks, emitReturnIssuesIfAny()]
      : [...postModifierChecks];
  }

  /**
   * The locals a nested composite declares before its children: its path,
   * when `readsPath`, and the Issue count `emitOnceChildrenPassed` compares
   * against, when it guards any `postModifierChecks`. None at the root, whose
   * path is `_checkType`'s parameter and which returns its Issues instead.
   *
   * ```ts
   * <frame of field0, nested>.emitDeclarations({ readsPath: true, postModifierChecks: [<.min(1)>] })
   * // ['const path1 = [...path, "tags"];', 'const issueCount1 = issues.length;']
   * <frame of value, at the root>.emitDeclarations({ readsPath: true, postModifierChecks: [<.min(1)>] }) // []
   * ```
   */
  public emitDeclarations({ readsPath, postModifierChecks }: EmitDeclarationsArgs): string[] {
    if (this.isRoot) {
      return [];
    }
    return [
      ...(readsPath ? [js`const ${this.path} = ${this.target.issuePath};`] : []),
      ...(postModifierChecks.length > 0 ? [js`const ${this.issueCount} = issues.length;`] : []),
    ];
  }

  /**
   * A composite's post-modifier checks (`.max(3)`, `.strict()`), placed so
   * they run only once every child has passed: a post-modifier runs only
   * once the type check has (ADR-0010), and a composite's type check
   * includes its children.
   *
   * At the root, `_checkType` returns the Issues as soon as there are any.
   * One return comes after the children, so a failing child skips the
   * post-modifiers, and one after the post-modifiers, so a failing one
   * never reaches `return { value: output }`. With no post-modifiers, only
   * the first is written, still needed before that return.
   *
   * Nested, it can't return, as that would skip the parent's other fields.
   * The checks run inside `if (issues.length === issueCount1)`: an
   * unchanged Issue count means no child added an Issue. It compares with
   * the count taken before the children (declared by `emitDeclarations`,
   * handed the same checks), not with 0, as the one `issues` array may
   * already hold the parent's Issues. With no post-modifiers, nothing is
   * written: the root's first return, which comes after all nested code,
   * returns whatever the children pushed.
   *
   * ```ts
   * <frame at the root>.emitOnceChildrenPassed({ postModifierChecks: [] })
   * // ['if (issues.length > 0) { return { issues }; }']
   * <frame at the root>.emitOnceChildrenPassed({ postModifierChecks: ['if (value.length > 3) { … }'] })
   * // ['if (issues.length > 0) { … }', 'if (value.length > 3) { … }', 'if (issues.length > 0) { … }']
   * <frame of field0, nested>.emitOnceChildrenPassed({ postModifierChecks: ['if (field0.length > 3) { … }'] })
   * // ['if (issues.length === issueCount1) {\n  if (field0.length > 3) { … }\n}']
   * ```
   */
  public emitOnceChildrenPassed({ postModifierChecks }: EmitPostModifierChecksArgs): string[] {
    if (this.isRoot) {
      return postModifierChecks.length === 0
        ? [emitReturnIssuesIfAny()]
        : [emitReturnIssuesIfAny(), ...postModifierChecks, emitReturnIssuesIfAny()];
    }
    return postModifierChecks.length === 0
      ? []
      : [
          emitBlock({
            head: js`if (issues.length === ${this.issueCount})`,
            body: postModifierChecks.join('\n'),
          }),
        ];
  }

  /**
   * The statements handing the checked value on: returned from
   * `_checkType` at the root, as the output a composite's checks built or
   * as `_checkType`'s own `value`; nested, a composite's output is put back
   * on the value its parent reads, and any other value is left as it is.
   *
   * ```ts
   * <frame of value, at the root, building an output>.emitOutputHandoff() // ['return { value: output };']
   * <frame of value, at the root, building none>.emitOutputHandoff()    // ['return { value };']
   * <frame of field0, nested, building an output>.emitOutputHandoff()   // ['field0 = output1;']
   * <frame of field1, nested, building none>.emitOutputHandoff()        // []
   * ```
   */
  private emitOutputHandoff(): string[] {
    if (this.isRoot) {
      return [this.buildsOutput ? js`return { value: ${this.output} };` : 'return { value };'];
    }
    return this.buildsOutput ? [js`${this.target.value} = ${this.output};`] : [];
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
