// The exception a GenericAst or PvlAst `read…`/`follow…` method throws at a
// node it can't read statically.
import type { Node } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { BaseException } from './baseException.js';

/** Thrown by a `read…`/`follow…` method at the first node it can't read statically, reported as COMPILE_ARGUMENT_UNRESOLVABLE. */
export class UnresolvedNodeException extends BaseException {
  /**
   * The exception at `unresolvedNode`, naming it.
   *
   * ```ts
   * new UnresolvedNodeException(<makeSchema()>).message
   * // "`makeSchema()` isn't a pvl Schema, a literal or a const holding one, so it can't be read statically."
   * ```
   */
  public constructor(unresolvedNode: Node) {
    super(
      `\`${unresolvedNode.getText()}\` isn't a pvl Schema, a literal or a const holding one, so it can't be read statically.`,
      { errorCode: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE, offendingNode: unresolvedNode },
    );
  }
}
