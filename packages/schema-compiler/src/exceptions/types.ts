// The exceptions' types: what every one is constructed with.
import type { DiagnosticCode } from '../diagnostics/enums.js';

/** What a BaseException is constructed with: the diagnostic it is reported as, and an `Error`'s own options, such as its `cause`. */
export type BaseExceptionOptions = ErrorOptions & {
  errorCode: DiagnosticCode;
};
