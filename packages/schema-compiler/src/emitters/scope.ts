// What emitting one Compiled Schema's class shares across every Schema
// nested in it: fresh names for the locals the emitted code declares.
import type { CompositeLocals } from './emittersTypes.js';

/**
 * What emitting one Compiled Schema's class shares across every Schema
 * nested in it: a fresh name for each local the emitted code declares.
 * Each nested Schema names its own Emitter (`Schema.emitter`). Names are
 * numbered across the whole class rather than built from their parent's,
 * so they stay short at any depth.
 *
 * ```ts
 * const scope = new Scope();
 * scope.nextField()           // 'field0'
 * scope.nextField()           // 'field1'
 * scope.nextCompositeLocals() // { input: 'input1', output: 'output1', …, path: 'path1', issueCount: 'issueCount1' }: the first composite's, the root's when it is one
 * ```
 */
export class Scope {
  private fieldCount = 0;

  private compositeCount = 0;

  /** The name of the next field's value: `field0`, `field1`, … */
  public nextField(): string {
    const name = `field${String(this.fieldCount)}`;
    this.fieldCount += 1;
    return name;
  }

  /**
   * The locals of the next composite, the root's included, each ending in
   * its number: `input1`, `path1`, …, then `input2`, `path2`, …
   *
   * ```ts
   * scope.nextCompositeLocals() // { input: 'input1', output: 'output1', index: 'index1', element: 'element1', path: 'path1', issueCount: 'issueCount1' }
   * scope.nextCompositeLocals() // { input: 'input2', …, issueCount: 'issueCount2' }
   * ```
   */
  public nextCompositeLocals(): CompositeLocals {
    this.compositeCount += 1;
    const suffix = String(this.compositeCount);
    return {
      input: `input${suffix}`,
      output: `output${suffix}`,
      index: `index${suffix}`,
      element: `element${suffix}`,
      path: `path${suffix}`,
      issueCount: `issueCount${suffix}`,
    };
  }
}
