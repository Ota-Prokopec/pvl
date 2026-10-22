// What emitting one Compiled Schema's class shares across every Schema
// nested in it: fresh names for the locals the emitted code declares.

/**
 * What emitting one Compiled Schema's class shares across every Schema
 * nested in it: a fresh name for each local the emitted code declares.
 * Each nested Schema names its own Emitter (`Schema.emitter`). Names are
 * numbered across the whole class rather than built from their parent's,
 * so they stay short at any depth.
 *
 * ```ts
 * const scope = new Scope();
 * scope.nextField() // 'field0'
 * scope.nextField() // 'field1'
 * scope.nextLocalSuffix() // '1': the first composite's locals are `input1`, `path1`, …, the root's when it is one
 * ```
 */
export class Scope {
  private fieldCount = 0;

  private nodeCount = 0;

  /** The name of the next field's value: `field0`, `field1`, … */
  public nextField(): string {
    const name = `field${String(this.fieldCount)}`;
    this.fieldCount += 1;
    return name;
  }

  /** The suffix of the next composite's locals, the root's included: `1`, `2`, … */
  public nextLocalSuffix(): string {
    this.nodeCount += 1;
    return String(this.nodeCount);
  }
}
