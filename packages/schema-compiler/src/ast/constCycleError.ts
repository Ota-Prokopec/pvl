// The error a GenericAst or PvlAst `read…`/`follow…` method throws at a
// `const` that refers back to itself.
import type { Node } from 'ts-morph';

/**
 * Thrown by a `read…`/`follow…` method at a `const` that is reached again
 * while its own value is still being read, which would never end. It is no
 * UnresolvedNodeError, so a caller catching one never catches the other.
 */
export class ConstCycleError extends Error {
  /** The identifier that names the `const` a second time. */
  public readonly cycleNode: Node;

  public constructor(cycleNode: Node) {
    super(`The const ${cycleNode.getText()} refers back to itself.`);
    this.cycleNode = cycleNode;
  }
}
