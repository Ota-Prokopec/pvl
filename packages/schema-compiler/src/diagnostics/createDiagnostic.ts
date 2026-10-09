// Builds a diagnostic with its code's own severity, and promotes it under
// `strict`; internal, so outside the diagnostics barrel.
import { DIAGNOSTIC_SEVERITY } from './consts.js';
import { SEVERITY, type DiagnosticCode } from './enums.js';
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

/**
 * Every diagnostic as an error, which is what `strict` reports. An error
 * stays an error, so promoting twice changes nothing.
 */
export const promoteDiagnosticsSeverity = (
  diagnostics: ReadonlyArray<Diagnostic>,
): Diagnostic[] => {
  return diagnostics.map((diagnostic) => ({ ...diagnostic, severity: SEVERITY.ERROR }));
};
