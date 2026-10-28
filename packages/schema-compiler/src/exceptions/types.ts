// The exceptions' types: what every one is constructed with.
import type { Node } from 'ts-morph';
import type { DiagnosticCode } from '../diagnostics/enums.js';

/** What a BaseException is constructed with: the diagnostic it is reported as, the node it is thrown at, and an `Error`'s own options, such as its `cause`. */
export type BaseExceptionOptions = ErrorOptions & {
  errorCode: DiagnosticCode;
  offendingNode: Node;
};
