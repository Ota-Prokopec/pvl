// The exception a GenericAst or PvlAst `read…`/`follow…` method throws at a
// `const` that refers back to itself.
import type { Node } from 'ts-morph';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';
import { BaseException } from './baseException.js';

/**
 * Thrown by a `read…`/`follow…` method at a `const` that is reached again
 * while its own value is still being read, which would never end, reported
 * as COMPILE_ARGUMENT_CYCLE. It is no UnresolvedNodeException, so a caller
 * catching one never catches the other.
 */
export class ConstCycleException extends BaseException {
  /**
   * The exception at `cycleNode`, the identifier that names the `const` a
   * second time, naming it.
   *
   * ```ts
   * // const user = pvl.object({ friend: user });
   * new ConstCycleException(<user>).message
   * // "`user` names a const that refers back to itself, so reading it would never end."
   * ```
   */
  public constructor(cycleNode: Node) {
    super(
      `\`${cycleNode.getText()}\` names a const that refers back to itself, so reading it would never end.`,
      { errorCode: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_CYCLE, node: cycleNode },
    );
  }
}
