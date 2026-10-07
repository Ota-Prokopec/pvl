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
import { isPathSpecifier } from './utils.js';

/** Bundler resolution, so `./user.js` finds `user.ts` the way the user's own build does. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
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

export const createProject = (): Project => {
  return new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: COMPILER_OPTIONS });
};

/** The scanned file `specifier` resolves to from `containingFile`, or `undefined` when it leaves the set. */
export const resolveScanned = (
  specifier: string,
  containingFile: string,
  scanned: ReadonlySet<string>,
): string | undefined => {
  if (!isPathSpecifier(specifier)) {
    return undefined;
  }
  const resolved = ts.resolveModuleName(specifier, containingFile, COMPILER_OPTIONS, ts.sys)
    .resolvedModule?.resolvedFileName;
  if (resolved === undefined) {
    return undefined;
  }
  const absolute = resolve(resolved);
  return scanned.has(absolute) ? absolute : undefined;
};

// Whether evaluating the importing module needs `declaration`'s target
// evaluated first. A type-only import or re-export is erased.
const isValueEdge = (declaration: ImportDeclaration | ExportDeclaration): boolean => {
  if (declaration.isTypeOnly()) {
    return false;
  }
  if (Node.isImportDeclaration(declaration)) {
    const named = declaration.getNamedImports();
    return (
      declaration.getDefaultImport() !== undefined ||
      declaration.getNamespaceImport() !== undefined ||
      named.length === 0 ||
      named.some((specifier) => !specifier.isTypeOnly())
    );
  }
  const named = declaration.getNamedExports();
  return named.length === 0 || named.some((specifier) => !specifier.isTypeOnly());
};

/** Adds every file to `project` and links each to the scanned modules it depends on. */
export const readModules = (project: Project, files: ReadonlyArray<string>): ScannedModule[] => {
  const scanned = new Set(files);
  return files.map((path) => {
    const sourceFile = project.addSourceFileAtPath(path);
    const dependencies = new Set<string>();
    for (const declaration of [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations(),
    ]) {
      const specifier = declaration.getModuleSpecifierValue();
      const target = specifier === undefined ? undefined : resolveScanned(specifier, path, scanned);
      if (target !== undefined && isValueEdge(declaration)) {
        dependencies.add(target);
      }
    }
    return { path, sourceFile, dependencies };
  });
};
