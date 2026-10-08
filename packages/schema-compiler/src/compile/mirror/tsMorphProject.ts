// The ts-morph project the scanned files are read into: how a module specifier
// resolves, and which import or re-export points into the scanned set.
import * as path from 'node:path';
import {
  Node,
  Project,
  ts,
  type ExportDeclaration,
  type ImportDeclaration,
  type SourceFile,
} from 'ts-morph';
import { isRelativeOrAbsoluteModuleSpecifier } from './utils.js';

/** One scanned file. */
export type ScannedModule = {
  /** The file's absolute path, as listed in the scanned file paths. */
  path: string;
  /** The file's ts-morph source file, added to the project, which the mirror reads and rewrites. */
  sourceFile: SourceFile;
  /** The scanned modules this one needs evaluated first: its value imports and re-exports into the set. */
  dependencies: Set<string>;
};

/**
 * Reads the scanned files into a ts-morph project and resolves module
 * specifiers between them. The mirror works on the scanned files' ts-morph
 * source files, and it has to tell an import into the scanned set, which it
 * follows into that file, from one out of it, which stays an import in the
 * Destination File. Module specifiers resolve the way a bundler resolves
 * them, so `./user.js` finds `user.ts` as the user's own build does; the
 * user's `tsconfig.json` is ignored.
 *
 * Public methods:
 *
 * - `create()`
 *   - **Input**: none.
 *   - **Output**: an empty ts-morph `Project` with bundler module resolution,
 *     for `readScannedModules` to add the scanned files to.
 *
 *   ```ts
 *   const tsMorphProject = TsMorphProject.create();
 *   ```
 *
 * - `readScannedModules(tsMorphProject, scannedFilePathList)`
 *   - **Input**:
 *     - `tsMorphProject`: the project from `create()`.
 *     - `scannedFilePathList`: the scanned files' absolute paths, as
 *       `findInputFiles` returns them. They are read from disk as they are
 *       and compared as exact strings against the paths imports resolve to.
 *   - **Output**: one `ScannedModule` per path, in the same order, not yet
 *     sorted for emission: its `path`, its parsed `sourceFile`, and its
 *     `dependencies`, the other scanned files that bring in a value through
 *     an import or a re-export and so must be evaluated first. An import of
 *     types only, of a package or of an unscanned file isn't a dependency.
 *     An empty list gives an empty array.
 *   - **Side effect**: adds every scanned file to `tsMorphProject`.
 *   - **Throws** ts-morph's error when a path can't be read from disk.
 *
 *   ```ts
 *   // post.ts
 *   import { pvl } from '@pvl/schema';      // a package: ignored
 *   import type { Tag } from './tag.js';    // types only: ignored
 *   import { user } from './user.js';       // dependency: user.ts
 *
 *   TsMorphProject.readScannedModules(tsMorphProject, ['/repo/src/schemas/post.ts', …])
 *   // [{ path: '/repo/src/schemas/post.ts',
 *   //    sourceFile: <post.ts, added to the project>,
 *   //    dependencies: Set { '/repo/src/schemas/user.ts' } }, …]
 *   ```
 *
 * - `findAbsoluteScannedFilePath(moduleSpecifier, importerPath, scannedFilePaths)`
 *   - **Input**:
 *     - `moduleSpecifier`: the module specifier as written (`'./user.js'`).
 *     - `importerPath`: the absolute path of the file it is written in.
 *     - `scannedFilePaths`: the scanned files' absolute paths.
 *   - **Output**: the absolute path of the scanned file the module specifier
 *     leads to, spelled as in `scannedFilePaths` so it can key maps built
 *     from the same set. `undefined` for every way of being outside the set:
 *     a package, a file that isn't scanned, and a module specifier that
 *     resolves to no file.
 *
 *   With `src/schemas/user.ts` and `src/schemas/post.ts` scanned, from
 *   `src/schemas/post.ts`:
 *
 *   ```ts
 *   TsMorphProject.findAbsoluteScannedFilePath('./user.js', …)     // '/repo/src/schemas/user.ts'
 *   TsMorphProject.findAbsoluteScannedFilePath('./user', …)        // '/repo/src/schemas/user.ts'
 *   TsMorphProject.findAbsoluteScannedFilePath('../helpers.js', …) // undefined: not scanned
 *   TsMorphProject.findAbsoluteScannedFilePath('@pvl/schema', …)   // undefined: a package
 *   TsMorphProject.findAbsoluteScannedFilePath('./missing.js', …)  // undefined: no such file
 *   ```
 */
export class TsMorphProject {
  /** Bundler resolution, so `./user.js` finds `user.ts` the way the user's own build does. */
  private static readonly BUNDLER_COMPILER_OPTIONS: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    allowImportingTsExtensions: true,
    noEmit: true,
  };

  /**
   * An empty ts-morph project that resolves modules the way a bundler does.
   * It ignores the user's `tsconfig.json`: only the scanned files are added,
   * one by one, by {@link TsMorphProject.readScannedModules}.
   */
  public static create(): Project {
    return new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: TsMorphProject.BUNDLER_COMPILER_OPTIONS,
    });
  }

  /**
   * The absolute path of the scanned file the module specifier
   * `moduleSpecifier`, written in the file `importerPath`, leads to, or
   * `undefined` when that isn't a file in `scannedFilePaths`.
   *
   * The module specifier is resolved the way a bundler does it, so a `.js`
   * one finds the `.ts` file and an extension-less one finds its file. The
   * path returned is the one in `scannedFilePaths`, so it can be used as a
   * key into maps built from the same set.
   *
   * ```ts
   * TsMorphProject.findAbsoluteScannedFilePath('./user.js', …)    // '/repo/src/schemas/user.ts'
   * TsMorphProject.findAbsoluteScannedFilePath('@pvl/schema', …)  // undefined: a package
   * ```
   */
  public static findAbsoluteScannedFilePath(
    moduleSpecifier: string,
    importerPath: string,
    scannedFilePaths: ReadonlySet<string>,
  ): string | undefined {
    if (!isRelativeOrAbsoluteModuleSpecifier(moduleSpecifier)) {
      return undefined;
    }

    const resolvedFileName = ts.resolveModuleName(
      moduleSpecifier,
      importerPath,
      TsMorphProject.BUNDLER_COMPILER_OPTIONS,
      ts.sys,
    ).resolvedModule?.resolvedFileName;

    if (resolvedFileName === undefined) {
      return undefined;
    }

    const absoluteResolvedPath = path.resolve(resolvedFileName);
    return scannedFilePaths.has(absoluteResolvedPath) ? absoluteResolvedPath : undefined;
  }

  // Whether evaluating the importing module needs the module that
  // `importOrExportDeclaration` names to be evaluated first. Anything that
  // brings in a value does; a declaration that brings in only types is erased
  // when compiled, so it doesn't.
  //
  //   import { user } from './user.js';           // yes
  //   import { type User, user } from './user.js'; // yes: `user` is a value
  //   import './setup.js';                        // yes: runs setup.ts
  //   export * from './user.js';                  // yes
  //   import type { User } from './user.js';      // no
  //   import { type User } from './user.js';      // no: every name is a type
  //   export type { User } from './user.js';      // no
  private static isRuntimeDependency(
    importOrExportDeclaration: ImportDeclaration | ExportDeclaration,
  ): boolean {
    if (importOrExportDeclaration.isTypeOnly()) {
      return false;
    }

    if (Node.isImportDeclaration(importOrExportDeclaration)) {
      const importSpecifiers = importOrExportDeclaration.getNamedImports();
      return (
        importOrExportDeclaration.getDefaultImport() !== undefined ||
        importOrExportDeclaration.getNamespaceImport() !== undefined ||
        importSpecifiers.length === 0 ||
        importSpecifiers.some((importSpecifier) => !importSpecifier.isTypeOnly())
      );
    }
    const exportSpecifiers = importOrExportDeclaration.getNamedExports();
    return (
      exportSpecifiers.length === 0 ||
      exportSpecifiers.some((exportSpecifier) => !exportSpecifier.isTypeOnly())
    );
  }

  /**
   * Loads each scanned file into `tsMorphProject` and returns it as a
   * `ScannedModule`: its absolute path, its parsed `sourceFile`, and its
   * `dependencies`, the other scanned files that must be evaluated before it.
   * The result has one entry per path, in the order of `scannedFilePathList`,
   * not yet sorted for emission.
   *
   * ```ts
   * // post.ts
   * import { pvl } from '@pvl/schema';         // outside the set: ignored
   * import type { Tag } from './tag.js';      // types only: ignored
   * import { user } from './user.js';         // dependency: user.ts
   *
   * // → { path: '/repo/src/schemas/post.ts',
   * //     sourceFile: <post.ts, added to the project>,
   * //     dependencies: Set { '/repo/src/schemas/user.ts' } }
   * ```
   */
  public static readScannedModules(
    tsMorphProject: Project,
    scannedFilePathList: ReadonlyArray<string>,
  ): ScannedModule[] {
    const scannedFilePaths = new Set(scannedFilePathList);

    return scannedFilePathList.map((path) => {
      const sourceFile = tsMorphProject.addSourceFileAtPath(path);

      // The scanned files that must be evaluated before this one. Of its import
      // and export declarations, it keeps those that need their target at
      // runtime (not types only), reads their module specifiers (an
      // `export { … }` without `from` has none), and keeps the ones that lead
      // to a scanned file (not a package or an unscanned file).
      //
      //   import { user } from './user.js';      // '/repo/src/schemas/user.ts'
      //   export * from './tag.js';              // '/repo/src/schemas/tag.ts'
      //   import './setup.js';                   // '/repo/src/schemas/setup.ts': runs it
      //   import type { Tag } from './tag.js';   // left out: types only
      //   export { user };                       // left out: no module specifier
      //   import { pvl } from '@pvl/schema';     // left out: not scanned
      const dependencies = new Set(
        [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
          .filter((importOrExportDeclaration) =>
            TsMorphProject.isRuntimeDependency(importOrExportDeclaration),
          )
          .map((importOrExportDeclaration) => importOrExportDeclaration.getModuleSpecifierValue())
          .filter((moduleSpecifier) => moduleSpecifier !== undefined)
          .map((moduleSpecifier) =>
            TsMorphProject.findAbsoluteScannedFilePath(moduleSpecifier, path, scannedFilePaths),
          )
          .filter((scannedTargetPath) => scannedTargetPath !== undefined),
      );

      return { path, sourceFile, dependencies };
    });
  }
}
