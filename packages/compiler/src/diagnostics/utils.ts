// What can be asked of or done to every diagnostic a compilation found.
import type { Diagnostic } from './diagnostic.js';

export const isErrorInDiagnostics = (diagnostics: ReadonlyArray<Diagnostic>): boolean => {
  return diagnostics.some((diagnostic) => diagnostic.isError());
};
export const promoteAllDiagnostics = (diagnostics: ReadonlyArray<Diagnostic>): Diagnostic[] => {
  return diagnostics.map((diagnostic) => diagnostic.promote());
};
