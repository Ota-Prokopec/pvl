// The error a GenericAst or PvlAst `read…`/`follow…` method throws at a node
// it can't read statically.
import type { Node } from 'ts-morph';

/** Thrown by a `read…`/`follow…` method at the first node it can't read statically. */
export class UnresolvedNodeError extends Error {
  public readonly unresolvedNode: Node;

  public constructor(unresolvedNode: Node) {
    super(`Can't read ${unresolvedNode.getText()} statically.`);
    this.unresolvedNode = unresolvedNode;
  }
}
