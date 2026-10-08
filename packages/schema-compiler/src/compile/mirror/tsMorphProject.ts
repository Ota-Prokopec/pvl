// The ts-morph project the scanned files are read into, and how a module
// specifier written in one of them resolves.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Project, ts } from 'ts-morph';

/** The file a module specifier resolves to. */
export type ResolvedModuleFile = {
  /** The file's absolute path. */
  path: string;
  /** Whether it was found through `node_modules`, as a package, rather than by path or alias. */
  isPackage: boolean;
};

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
   * An empty ts-morph project that resolves module specifiers the way a
   * bundler does, through the `paths` of `<baseDirectory>/tsconfig.json`
   * when there is one. None of the tsconfig's files are added: the mirror
   * adds the scanned files itself.
   *
   * ```ts
   * // /repo/tsconfig.json: { "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }
   * const tsMorphProject = TsMorphProject.create('/repo');
   * // '@/schemas/user' now resolves to /repo/src/schemas/user.ts
   * ```
   */
  public static create(baseDirectory: string): Project {
    const tsConfigFilePath = join(baseDirectory, TsMorphProject.TSCONFIG_FILE_NAME);
    return new Project({
      ...(existsSync(tsConfigFilePath) ? { tsConfigFilePath } : {}),
      skipAddingFilesFromTsConfig: true,
      compilerOptions: TsMorphProject.BUNDLER_COMPILER_OPTIONS,
    });
  }

  /**
   * The file `moduleSpecifier`, written in the file `importerPath`, resolves
   * to, or `undefined` when it resolves to none.
   *
   * ```ts
   * TsMorphProject.resolveModuleFile(tsMorphProject, './user.js', …)
   * // { path: '/repo/src/schemas/user.ts', isPackage: false }
   * TsMorphProject.resolveModuleFile(tsMorphProject, '@/lib/helpers', …)
   * // { path: '/repo/src/lib/helpers.ts', isPackage: false }: through tsconfig `paths`
   * TsMorphProject.resolveModuleFile(tsMorphProject, '@pvl/schema', …)
   * // { path: '/repo/node_modules/@pvl/schema/dist/index.d.ts', isPackage: true }
   * TsMorphProject.resolveModuleFile(tsMorphProject, './missing.js', …) // undefined
   * ```
   */
  public static resolveModuleFile(
    tsMorphProject: Project,
    moduleSpecifier: string,
    importerPath: string,
  ): ResolvedModuleFile | undefined {
    const resolvedModule = ts.resolveModuleName(
      moduleSpecifier,
      importerPath,
      tsMorphProject.getCompilerOptions(),
      ts.sys,
    ).resolvedModule;
    return resolvedModule === undefined
      ? undefined
      : {
          path: resolve(resolvedModule.resolvedFileName),
          isPackage: resolvedModule.isExternalLibraryImport ?? false,
        };
  }
}
