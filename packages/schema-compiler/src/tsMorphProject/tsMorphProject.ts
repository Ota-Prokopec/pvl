// The ts-morph project the scanned files are read into, built from the
// application's tsconfig.
import * as path from 'node:path';
import { Project, ts } from 'ts-morph';
import { errorMessage } from '../utils.js';
import {
  BUNDLER_COMPILER_OPTIONS,
  NO_INPUTS_FOUND_ERROR_CODE,
  TSCONFIG_FILE_NAME,
} from './consts.js';
import type { CreateTsMorphProjectPayload } from './types.js';
import { createTsConfigUnreadableDiagnostic } from './utils.js';

/** Builds the ts-morph project the mirror reads the scanned files into, from the application's tsconfig. */
export class TsMorphProject {
  /**
   * An empty ts-morph project that resolves module specifiers the way a
   * bundler does, through the `paths` of `<baseDirectory>/tsconfig.json`
   * (and whatever it extends) when there is one. None of the tsconfig's
   * files are added: the mirror adds the scanned files itself.
   *
   * ```ts
   * // /repo/tsconfig.json: { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
   * TsMorphProject.create('/repo') // { tsMorphProject, diagnostics: [] }: '@/schemas/user' resolves to /repo/src/schemas/user.ts
   * // /repo/tsconfig.json: { "include": ["app/**\/*.ts"] }, with no file there
   * TsMorphProject.create('/repo') // { tsMorphProject, diagnostics: [] }: "No inputs were found" is ignored
   * // /repo/tsconfig.json: '{ "compilerOptions": ', or a file the process may not read
   * TsMorphProject.create('/repo') // { tsMorphProject: undefined, diagnostics: [TSCONFIG_UNREADABLE] }
   * // /repo/tsconfig.json: { "extends": "./missing.json" }
   * TsMorphProject.create('/repo') // { tsMorphProject: undefined, diagnostics: [TSCONFIG_UNREADABLE] }
   * ```
   */
  public static create(baseDirectory: string): CreateTsMorphProjectPayload {
    const tsConfigFilePath = path.join(baseDirectory, TSCONFIG_FILE_NAME);

    let tsMorphProject: Project;
    try {
      tsMorphProject = new Project({
        tsConfigFilePath: ts.sys.fileExists(tsConfigFilePath) ? tsConfigFilePath : undefined,
        skipAddingFilesFromTsConfig: true,
        // Laid over the tsconfig's own options.
        compilerOptions: BUNDLER_COMPILER_OPTIONS,
      });
    } catch (error) {
      // Only ts-morph reading the tsconfig runs here, so what it throws (a
      // file it can't read, JSON it can't parse) is the tsconfig's fault,
      // never a bug of the compiler's (ADR-0037).
      return {
        tsMorphProject: undefined,
        diagnostics: [createTsConfigUnreadableDiagnostic(tsConfigFilePath, errorMessage(error))],
      };
    }

    // An `extends` that can't be read doesn't throw: TypeScript lists it among the tsconfig's
    // errors, next to the harmless "No inputs were found" one, which is skipped.
    const tsConfigError = tsMorphProject
      .getConfigFileParsingDiagnostics()
      .find((diagnostic) => diagnostic.getCode() !== NO_INPUTS_FOUND_ERROR_CODE);

    return tsConfigError === undefined
      ? { tsMorphProject, diagnostics: [] }
      : {
          tsMorphProject: undefined,
          diagnostics: [
            createTsConfigUnreadableDiagnostic(
              tsConfigFilePath,
              ts.flattenDiagnosticMessageText(tsConfigError.compilerObject.messageText, ' '),
            ),
          ],
        };
  }
}
