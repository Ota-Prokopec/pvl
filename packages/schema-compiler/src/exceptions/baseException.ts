// The base of every exception the compiler throws and catches on purpose,
// each naming the diagnostic it is reported as (ADR-0037).
import type { DiagnosticCode } from '../diagnostics/enums.js';
import type { BaseExceptionOptions } from './types.js';

/**
 * A failure the compiler expects and recovers from, reported as the
 * diagnostic `errorCode` names wherever it is caught to be reported. Its
 * `message` describes only its own node, so the catch adds which Schema it
 * is in. A bug in the compiler throws a plain `Error` instead, which
 * nothing catches.
 *
 * ```ts
 * new UnresolvedNodeException(<makeSchema()>).errorCode // 'COMPILE_ARGUMENT_UNRESOLVABLE'
 * new UnresolvedNodeException(<makeSchema()>).name      // 'UnresolvedNodeException'
 * ```
 */
export abstract class BaseException extends Error {
  /** The diagnostic it is reported as. */
  public readonly errorCode: DiagnosticCode;

  /**
   * An exception named after its subclass, so a stack trace or a log shows
   * which one it is.
   *
   * ```ts
   * super(`\`${node.getText()}\` can't be read statically.`, { errorCode: DIAGNOSTIC_CODE.COMPILE_ARGUMENT_UNRESOLVABLE });
   * ```
   */
  public constructor(message: string, { errorCode, ...errorOptions }: BaseExceptionOptions) {
    super(message, errorOptions);
    this.name = new.target.name;
    this.errorCode = errorCode;
  }
}
