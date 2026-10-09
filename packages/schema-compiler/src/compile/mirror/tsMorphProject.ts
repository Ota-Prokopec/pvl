// The ts-morph project the scanned files are read into, and how a module
// specifier written in one of them resolves.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Project, ts } from 'ts-morph';
import { createDiagnostic } from '../../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { DIAGNOSTIC_CODE } from '../../diagnostics/enums.js';
import type { Path } from '../path.js';
import { isPathModuleSpecifier } from './utils.js';

/** The project the mirror reads into, or why the application's tsconfig stops it from being built. */
export type CreateTsMorphProjectPayload =
  | { tsMorphProject: Project; diagnostics: [] }
  | { tsMorphProject: undefined; diagnostics: [Diagnostic] };

/** The file a module specifier resolves to. */
export type ModuleFile = Path & {
  /** Whether it was found through `node_modules`, as a package, rather than by path or alias. */
  isPackage: boolean;
};

/**
 * Builds the ts-morph project the mirror reads the scanned files into, from the
 * application's tsconfig, and resolves a module specifier to the file it names.
 */
export class TsMorphProject {
  /** The application's tsconfig, read for its `paths` aliases when it exists. */
  private static readonly TSCONFIG_FILE_NAME = 'tsconfig.json' as const;

  /**
   * Bundler resolution over whatever the application's tsconfig says, so
   * `./user.js` finds `user.ts` and an extension-less module specifier finds
   * its file, the way the application's own build does.
   */
  private static readonly BUNDLER_COMPILER_OPTIONS: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    noEmit: true,
  };

  /**
   * TypeScript's "No inputs were found in config file" error, which says
   * nothing about resolution: the mirror adds the scanned files itself.
   */
  private static readonly NO_INPUTS_FOUND_ERROR_CODE = 18003 as const;

  /**
   * An empty ts-morph project that resolves module specifiers the way a
   * bundler does, through the `paths` of `<baseDirectory>/tsconfig.json`
   * (and whatever it extends) when there is one. None of the tsconfig's
   * files are added: the mirror adds the scanned files itself.
   *
   * ```ts
   * // /repo/tsconfig.json: { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
   * TsMorphProject.create('/repo')
   * // { tsMorphProject, diagnostics: [] }: '@/schemas/user' resolves to /repo/src/schemas/user.ts
   * // /repo/tsconfig.json: { "compilerOptions":
   * // { tsMorphProject: undefined, diagnostics: [TSCONFIG_UNREADABLE] }
   * // /repo/tsconfig.json: { "extends": "./missing.json" }
   * // { tsMorphProject: undefined, diagnostics: [TSCONFIG_UNREADABLE] }
   * ```
   *
   * A tsconfig whose own `include` matches no file is fine.
   */
  public static create(baseDirectory: string): CreateTsMorphProjectPayload {
    const tsConfigFilePath = join(baseDirectory, TsMorphProject.TSCONFIG_FILE_NAME);

    const tsConfig = existsSync(tsConfigFilePath)
      ? TsMorphProject.readTsConfig(tsConfigFilePath, baseDirectory)
      : { compilerOptions: {} };

    if ('reason' in tsConfig) {
      return {
        tsMorphProject: undefined,
        diagnostics: [
          createDiagnostic({
            code: DIAGNOSTIC_CODE.TSCONFIG_UNREADABLE,
            message: `This tsconfig can't be read, so alias imports can't be resolved: ${tsConfig.reason}`,
            file: tsConfigFilePath,
          }),
        ],
      };
    }

    return {
      tsMorphProject: new Project({
        skipAddingFilesFromTsConfig: true,
        compilerOptions: {
          ...tsConfig.compilerOptions,
          ...TsMorphProject.BUNDLER_COMPILER_OPTIONS,
        },
      }),
      diagnostics: [],
    };
  }

  /**
   * The compiler options the existing tsconfig at `tsConfigFilePath` sets,
   * following `extends`, or why they can't be read, in TypeScript's words.
   *
   * ```ts
   * { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } } // { compilerOptions: { paths: … } }
   * { "compilerOptions":                                       // { reason: 'Expression expected.' }
   * { "extends": "./missing.json" }                            // { reason: "Cannot read file '/repo/missing.json'." }
   * a file the process may not read                            // { reason: 'The file could not be read.' }
   * { "include": ["app/**\/*.ts"] } with no file there          // { compilerOptions: {} }: "No inputs were found" is ignored
   * ```
   */
  private static readTsConfig(
    tsConfigFilePath: string,
    baseDirectory: string,
  ): { compilerOptions: ts.CompilerOptions } | { reason: string } {
    const tsConfigText = ts.sys.readFile(tsConfigFilePath);
    if (tsConfigText === undefined) {
      return { reason: 'The file could not be read.' };
    }

    const tsConfigJson = ts.parseConfigFileTextToJson(tsConfigFilePath, tsConfigText);
    if (tsConfigJson.error !== undefined) {
      return { reason: ts.flattenDiagnosticMessageText(tsConfigJson.error.messageText, ' ') };
    }

    const parsedTsConfig = ts.parseJsonConfigFileContent(
      tsConfigJson.config,
      ts.sys,
      baseDirectory,
      undefined,
      tsConfigFilePath,
    );

    const tsConfigError = parsedTsConfig.errors.find(
      ({ code }) => code !== TsMorphProject.NO_INPUTS_FOUND_ERROR_CODE,
    );
    return tsConfigError === undefined
      ? { compilerOptions: parsedTsConfig.options }
      : { reason: ts.flattenDiagnosticMessageText(tsConfigError.messageText, ' ') };
  }

  /**
   * The file `moduleSpecifier`, written in the file `importerPath`, resolves
   * to, and whether it is a package's, or `undefined` when it resolves to none.
   * A bare module specifier that tsconfig `paths` maps but `node_modules` also
   * holds, as a workspace package often is, counts as a package, so the mirror
   * keeps it as written.
   *
   * ```ts
   * // importerPath: '/repo/src/schemas/order.ts'
   * // tsconfig `paths`: { "@/*": ["./src/*"], "@pvl/schema": ["./packages/schema/src/index.ts"] }
   * './user.js'         // { absolutePath: '/repo/src/schemas/user.ts', isPackage: false }
   * '../lib/helpers.js' // { absolutePath: '/repo/src/lib/helpers.ts', isPackage: false }
   * '@/lib/helpers'     // { absolutePath: '/repo/src/lib/helpers.ts', isPackage: false }: through `paths`
   * '@pvl/schema'       // { absolutePath: '/repo/node_modules/@pvl/schema/dist/index.d.ts', isPackage: true }
   *                     // not './packages/schema/src/index.ts': `node_modules` wins over `paths`
   *                     // '/repo/packages/schema/dist/index.d.ts' when node_modules/@pvl/schema is a symlink
   * './missing.js'      // undefined
   * 'not-installed'     // undefined
   * ```
   */
  public static resolveModuleFile(
    tsMorphProject: Project,
    moduleSpecifier: string,
    importerPath: string,
  ): ModuleFile | undefined {
    const compilerOptions = tsMorphProject.getCompilerOptions();

    // Resolve the way the application's build does: tsconfig `paths` first,
    // then relative paths and `node_modules`.
    const { resolvedModule } = ts.resolveModuleName(
      moduleSpecifier,
      importerPath,
      compilerOptions,
      ts.sys,
    );

    if (resolvedModule === undefined) {
      return undefined;
    }

    // TypeScript tries `paths` before `node_modules`, so a bare module
    // specifier that `paths` maps resolves to a local file even when it is
    // also an installed package, as a workspace package mapped to its source
    // often is. Only a bare module specifier can be one, and only when `paths`
    // is set and the first resolution didn't already land in `node_modules`.
    if (
      resolvedModule.isExternalLibraryImport !== true &&
      !isPathModuleSpecifier(moduleSpecifier) &&
      compilerOptions.paths !== undefined
    ) {
      // Resolve it again without `paths`: when `node_modules` holds it, it is
      // a package, and the mirror keeps it as written instead of pointing
      // into the package's source.
      // resolvedPackage.resolvedFileName is an absolute path to the file (ts-morph documentation)
      const resolvedPackage = ts.resolveModuleName(
        moduleSpecifier,
        importerPath,
        { ...compilerOptions, paths: undefined },
        ts.sys,
      ).resolvedModule;

      if (resolvedPackage?.isExternalLibraryImport === true) {
        return { absolutePath: resolve(resolvedPackage.resolvedFileName), isPackage: true };
      }
    }

    // Normalised to an absolute path, the form the mirror's paths are keyed by.
    return {
      absolutePath: resolve(resolvedModule.resolvedFileName),
      isPackage: resolvedModule.isExternalLibraryImport ?? false,
    };
  }
}
