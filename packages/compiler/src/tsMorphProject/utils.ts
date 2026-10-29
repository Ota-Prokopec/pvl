// The diagnostic `TsMorphProject.create` reports for a tsconfig it can't read.
import { Diagnostic } from '../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../diagnostics/enums.js';

/**
 * A TSCONFIG_UNREADABLE error for the tsconfig at `tsConfigFilePath`, giving
 * `reason` for it in TypeScript's or Node's words.
 *
 * ```ts
 * createTsConfigUnreadableDiagnostic('/repo/tsconfig.json', "Cannot read file '/repo/missing.json'.")
 * // → TSCONFIG_UNREADABLE: This tsconfig can't be read, so alias imports can't be resolved: Cannot read file '/repo/missing.json'.
 * ```
 */
export const createTsConfigUnreadableDiagnostic = (
  tsConfigFilePath: string,
  reason: string,
): Diagnostic => {
  return new Diagnostic({
    code: DIAGNOSTIC_CODE.TSCONFIG_UNREADABLE,
    message: `This tsconfig can't be read, so alias imports can't be resolved: ${reason}`,
    file: tsConfigFilePath,
  });
};
