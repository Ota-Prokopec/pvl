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

/** An empty ts-morph project resolving modules the way a bundler does; the scanned files are added to it one by one. */
export const createTsMorphProject = (): Project => {
  return new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: BUNDLER_COMPILER_OPTIONS,
  });
};

/** The scanned file `moduleSpecifier` resolves to from `importerPath`, or `undefined` when it leaves the set. */
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

// Whether evaluating the importing module needs `importOrExportDeclaration`'s target
// evaluated first. A type-only import or re-export is erased.
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
      namedSpecifiers.some((moduleSpecifier) => !moduleSpecifier.isTypeOnly())
    );
  }
  const namedSpecifiers = importOrExportDeclaration.getNamedExports();
  return (
    namedSpecifiers.length === 0 ||
    namedSpecifiers.some((moduleSpecifier) => !moduleSpecifier.isTypeOnly())
  );
};

/** Adds every file to `project` and links each to the scanned modules it depends on. */
export const readScannedModules = (
  project: Project,
  scannedFilePathList: ReadonlyArray<string>,
): ScannedModule[] => {
  const scannedFilePaths = new Set(scannedFilePathList);
  return scannedFilePathList.map((path) => {
    const sourceFile = project.addSourceFileAtPath(path);
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
