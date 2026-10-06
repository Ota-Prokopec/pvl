// Builds a diagnostic with its code's own severity; internal, so outside
// the diagnostics barrel.
import { DIAGNOSTIC_SEVERITY, type DiagnosticCode } from './consts.js';
import type { Diagnostic } from './diagnostic.js';

export type CreateDiagnosticArgs = {
  code: DiagnosticCode;
  message: string;
  file?: string;
};

/** A diagnostic with its code's own severity (`DIAGNOSTIC_SEVERITY`). */
export const createDiagnostic = ({ code, message, file }: CreateDiagnosticArgs): Diagnostic => {
  return {
    code,
    severity: DIAGNOSTIC_SEVERITY[code],
    message,
    ...(file === undefined ? {} : { file }),
  };
};
