// The ts-morph project the scanned files are read into: how a specifier
// resolves, and which import or re-export points into the scanned set.
import { resolve } from 'node:path';
import {
  Node,
  Project,
  ts,
  type ExportDeclaration,
  type ImportDeclaration,
  type SourceFile,
} from 'ts-morph';
import { isRelativeOrAbsoluteSpecifier } from './utils.js';

/** Bundler resolution, so `./user.js` finds `user.ts` the way the user's own build does. */
const BUNDLER_COMPILER_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
  allowImportingTsExtensions: true,
  noEmit: true,
};

/** One scanned file. */
export type ScannedModule = {
  /** Absolute. */
  path: string;
  sourceFile: SourceFile;
  /** The scanned modules this one needs evaluated first: its value imports and re-exports into the set. */
  dependencies: Set<string>;
};

/**
 * An empty ts-morph project that resolves modules the way a bundler does.
 * It ignores the user's `tsconfig.json`: only the scanned files are added,
 * one by one, by {@link readScannedModules}.
 */
export const createTsMorphProject = (): Project => {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: BUNDLER_COMPILER_OPTIONS,
  });
};

/**
 * The absolute path of the scanned file `moduleSpecifier` resolves to when
 * imported from `importerPath`, or `undefined` when it resolves to anything
 * outside the scanned set. Resolution follows the bundler rules, so a `.js`
 * specifier finds the `.ts` file.
 *
 * With `src/schemas/user.ts` and `src/schemas/post.ts` scanned, from
 * `src/schemas/post.ts`:
 *
 * ```ts
 * resolveToScannedFile('./user.js', …)      // '/repo/src/schemas/user.ts'
 * resolveToScannedFile('./user', …)         // '/repo/src/schemas/user.ts'
 * resolveToScannedFile('../helpers.js', …)  // undefined: not scanned
 * resolveToScannedFile('@pvl/schema', …)    // undefined: a package, never scanned
 * resolveToScannedFile('./missing.js', …)   // undefined: resolves to no file
 * ```
 */
export const resolveToScannedFile = (
  moduleSpecifier: string,
  importerPath: string,
  scannedFilePaths: ReadonlySet<string>,
): string | undefined => {
  if (!isRelativeOrAbsoluteSpecifier(moduleSpecifier)) {
    return undefined;
  }
  const resolvedFileName = ts.resolveModuleName(
    moduleSpecifier,
    importerPath,
    BUNDLER_COMPILER_OPTIONS,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  if (resolvedFileName === undefined) {
    return undefined;
  }
  const absoluteResolvedPath = resolve(resolvedFileName);
  return scannedFilePaths.has(absoluteResolvedPath) ? absoluteResolvedPath : undefined;
};

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
const isRuntimeDependency = (
  importOrExportDeclaration: ImportDeclaration | ExportDeclaration,
): boolean => {
  if (importOrExportDeclaration.isTypeOnly()) {
    return false;
  }
  if (Node.isImportDeclaration(importOrExportDeclaration)) {
    const namedSpecifiers = importOrExportDeclaration.getNamedImports();
    return (
      importOrExportDeclaration.getDefaultImport() !== undefined ||
      importOrExportDeclaration.getNamespaceImport() !== undefined ||
      namedSpecifiers.length === 0 ||
      namedSpecifiers.some((namedSpecifier) => !namedSpecifier.isTypeOnly())
    );
  }
  const namedSpecifiers = importOrExportDeclaration.getNamedExports();
  return (
    namedSpecifiers.length === 0 ||
    namedSpecifiers.some((namedSpecifier) => !namedSpecifier.isTypeOnly())
  );
};

/**
 * Adds every scanned file to `tsMorphProject` and records, for each, the
 * scanned files it needs evaluated first. An import of something outside
 * the set, or of types only, isn't a dependency.
 *
 * ```ts
 * // post.ts
 * import { pvl } from '@pvl/schema';         // outside the set: ignored
 * import type { Tag } from './tag.js';      // types only: ignored
 * import { user } from './user.js';         // dependency: user.ts
 * ```
 *
 * gives `post.ts` the dependencies `{ '/repo/src/schemas/user.ts' }`.
 */
export const readScannedModules = (
  tsMorphProject: Project,
  scannedFilePathList: ReadonlyArray<string>,
): ScannedModule[] => {
  const scannedFilePaths = new Set(scannedFilePathList);
  return scannedFilePathList.map((path) => {
    const sourceFile = tsMorphProject.addSourceFileAtPath(path);
    const dependencies = new Set<string>();
    for (const importOrExportDeclaration of [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations(),
    ]) {
      const moduleSpecifier = importOrExportDeclaration.getModuleSpecifierValue();
      const scannedTargetPath =
        moduleSpecifier === undefined
          ? undefined
          : resolveToScannedFile(moduleSpecifier, path, scannedFilePaths);
      if (scannedTargetPath !== undefined && isRuntimeDependency(importOrExportDeclaration)) {
        dependencies.add(scannedTargetPath);
      }
    }
    return { path, sourceFile, dependencies };
  });
};
