// Where a composite's checks are inlined, and the little that changes with
// it: the root of a Compiled Schema's `_checkType`, which returns on the
// first Issues it can, or a parent, which reads the output back off the value
// it holds. A composite's emitter writes its checks once, for both, through
// the locals and statements its frame hands it.
import type { EmitScope } from './emitScope.js';
import type { EmittingCheckMethodInput } from './emittersTypes.js';
import { emitBlock, js } from './utils.js';

/** What a CompositeFrame is created for. */
export type CompositeFrameOptions = {
  /** The composite's value and the Issue path of an Issue about it, as its parent hands them on. */
  target: EmittingCheckMethodInput;
  /** Numbers a nested composite's locals. */
  scope: EmitScope;
  /** Whether it is the Schema `pvl.compile()` wraps, emitted as `_checkType`'s body. */
  isRoot: boolean;
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
 * Where a composite's checks are inlined, and the names of the locals they
 * declare. At the root, its value and path are `_checkType`'s own `value`
 * and `path`, and its locals plain (`input`, `output`). Nested, it numbers
 * its locals (`input1`, `output1`), so they never clash with its parent's,
 * and keeps its Issue path in one (`path1`), so its children's paths stay as
 * short at any depth.
 *
 * ```ts
 * new CompositeFrame({ target: { value: 'value', issuePath: ROOT_ISSUE_PATH }, scope, isRoot: true })
 * // { input: 'input', output: 'output', path: 'path', issuePath: ROOT_ISSUE_PATH, … }
 * new CompositeFrame({ target: { value: 'field0', issuePath: '[...path, "user"]' }, scope, isRoot: false })
 * // { input: 'input1', output: 'output1', path: 'path1', issuePath: 'path1', … }
 * ```
 */
export class CompositeFrame {
  /** An object's value, read as a record: `input`, `input1`, … */
  public readonly input: string;
  /** The output its checks build: `output`, `output1`, … */
  public readonly output: string;
  /** An array's loop index: `index`, `index1`, … */
  public readonly index: string;
  /** An array's element: `element`, `element1`, … */
  public readonly element: string;
  /** The path its children's Issue paths extend: `_checkType`'s `path` at the root, `path1`, … nested. */
  public readonly path: string;
  /** The Issue path of an Issue about the composite itself: `ROOT_ISSUE_PATH` at the root, `path1`, … nested. */
  public readonly issuePath: string;

  private readonly target: EmittingCheckMethodInput;
  private readonly isRoot: boolean;
  // The count of Issues before the composite's children, which is unchanged
  // once they have all passed.
  private readonly issueCount: string;

  /** A frame for the composite at `target`, numbering its locals from `scope` when it is nested. */
  public constructor({ target, scope, isRoot }: CompositeFrameOptions) {
    const suffix = isRoot ? '' : scope.nextLocalSuffix();
    this.target = target;
    this.isRoot = isRoot;
    this.input = `input${suffix}`;
    this.output = `output${suffix}`;
    this.index = `index${suffix}`;
    this.element = `element${suffix}`;
    this.path = `path${suffix}`;
    this.issuePath = isRoot ? target.issuePath : this.path;
    this.issueCount = `issueCount${suffix}`;
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
  public emitDeclarations({
    readsPath,
    postModifierChecks,
  }: {
    readsPath: boolean;
    postModifierChecks: ReadonlyArray<string>;
  }): string[] {
    if (this.isRoot) {
      return [];
    }
    return [
      ...(readsPath ? [js`const ${this.path} = ${this.target.issuePath};`] : []),
      ...(postModifierChecks.length > 0 ? [js`const ${this.issueCount} = issues.length;`] : []),
    ];
  }

  /**
   * The composite's post-modifier checks (`.max(3)`, `.strict()`), placed so
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
  public emitOnceChildrenPassed({
    postModifierChecks,
  }: {
    postModifierChecks: ReadonlyArray<string>;
  }): string[] {
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
   * The statement handing the output on: returned from `_checkType` at the
   * root, put back on the value its parent reads nested.
   *
   * ```ts
   * <frame of value, at the root>.emitOutputHandoff() // 'return { value: output };'
   * <frame of field0, nested>.emitOutputHandoff()     // 'field0 = output1;'
   * ```
   */
  public emitOutputHandoff(): string {
    return this.isRoot
      ? js`return { value: ${this.output} };`
      : js`${this.target.value} = ${this.output};`;
  }
}
