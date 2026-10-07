// Follows a name through imports and re-exports within the scanned set to
// where it is actually bound.
import type { ExportDeclaration } from 'ts-morph';
import { getAliasOrOwnName, type ModuleContext } from './context.js';
import { resolveToScannedFile } from './tsMorphProject.js';
import { rewriteSpecifierForOutputDirectory } from './utils.js';

/**
 * `LOCAL` is a top-level declaration of a scanned module; `EXTERNAL` is an
 * import from outside the set.
 */
export const ORIGIN_KIND = {
  LOCAL: 'LOCAL',
  EXTERNAL: 'EXTERNAL',
} as const;

/** Where a {@link ORIGIN_KIND.LOCAL} name is bound: a scanned module's own declaration. */
export type LocalOrigin = {
  kind: typeof ORIGIN_KIND.LOCAL;
  modulePath: string;
  declarationName: string;
};

/**
 * Where a name is bound. An {@link ORIGIN_KIND.EXTERNAL} origin's
 * `rewrittenSpecifier` is already rewritten to resolve from the destination.
 */
export type Origin =
  | LocalOrigin
  | { kind: typeof ORIGIN_KIND.EXTERNAL; rewrittenSpecifier: string; importedName: string };

/** Equal for two origins exactly when they are the same binding. */
export const toOriginKey = (origin: Origin): string => {
  return origin.kind === ORIGIN_KIND.LOCAL
    ? `local:${origin.modulePath}:${origin.declarationName}`
    : `external:${origin.rewrittenSpecifier}:${origin.importedName}`;
};

/** What resolving an origin reads: every scanned module, by path. */
export type OriginLookup = {
  moduleContextByPath: ReadonlyMap<string, ModuleContext>;
  scannedFilePaths: ReadonlySet<string>;
  outputDirectory: string;
};

export type CreateOriginLookupArgs = {
  /** Every scanned module, in any order. */
  moduleContexts: ReadonlyArray<ModuleContext>;
  scannedFilePaths: ReadonlySet<string>;
  outputDirectory: string;
};

/** Indexes the scanned modules by path, for resolving where a name is bound. */
export const createOriginLookup = ({
  moduleContexts,
  scannedFilePaths,
  outputDirectory,
}: CreateOriginLookupArgs): OriginLookup => {
  return {
    moduleContextByPath: new Map(
      moduleContexts.map((moduleContext) => [moduleContext.scannedModule.path, moduleContext]),
    ),
    scannedFilePaths,
    outputDirectory,
  };
};

// One resolution in progress. `visitedExportKeys` stops a re-export cycle, which only a
// type-only cycle can form.
type OriginResolution = {
  originLookup: OriginLookup;
  visitedExportKeys: Set<string>;
};

// Where `targetPath`'s export `exportedName` is bound; if the user's code
// names an export `targetPath` doesn't have, the reference is kept as written.
const followExportOrKeepReference = (
  resolution: OriginResolution,
  targetPath: string,
  exportedName: string,
): Origin => {
  return (
    followExport(resolution, targetPath, exportedName) ?? {
      kind: ORIGIN_KIND.LOCAL,
      modulePath: targetPath,
      declarationName: exportedName,
    }
  );
};

// Where the top-level name `localName` of a module is bound: its own
// declaration, or what the import binding it is points at.
const followLocalName = (
  resolution: OriginResolution,
  moduleContext: ModuleContext,
  localName: string,
): Origin => {
  const importBinding = moduleContext.importBindings.find(
    (candidate) => candidate.localName === localName,
  );
  if (importBinding === undefined) {
    return {
      kind: ORIGIN_KIND.LOCAL,
      modulePath: moduleContext.scannedModule.path,
      declarationName: localName,
    };
  }
  return importBinding.scannedTargetPath === undefined
    ? {
        kind: ORIGIN_KIND.EXTERNAL,
        rewrittenSpecifier: importBinding.rewrittenSpecifier,
        importedName: importBinding.importedName,
      }
    : followExportOrKeepReference(
        resolution,
        importBinding.scannedTargetPath,
        importBinding.importedName,
      );
};

type FollowReExportArgs = {
  resolution: OriginResolution;
  modulePath: string;
  exportDeclaration: ExportDeclaration;
  exportedName: string;
};

// Where `export … from` in module `modulePath` binds `exportedName`, or
// `undefined` when it doesn't export that name.
const followReExport = ({
  resolution,
  modulePath,
  exportDeclaration,
  exportedName,
}: FollowReExportArgs): Origin | undefined => {
  const moduleSpecifier = exportDeclaration.getModuleSpecifierValue();
  if (moduleSpecifier === undefined) {
    return undefined;
  }
  const targetPath = resolveToScannedFile(
    moduleSpecifier,
    modulePath,
    resolution.originLookup.scannedFilePaths,
  );
  const rewrittenSpecifier = rewriteSpecifierForOutputDirectory(
    moduleSpecifier,
    modulePath,
    resolution.originLookup.outputDirectory,
  );
  const namespaceExportNode = exportDeclaration.getNamespaceExport();
  if (namespaceExportNode !== undefined) {
    return namespaceExportNode.getName() === exportedName
      ? { kind: ORIGIN_KIND.EXTERNAL, rewrittenSpecifier, importedName: '*' }
      : undefined;
  }
  const namedExports = exportDeclaration.getNamedExports();
  if (namedExports.length === 0) {
    // `export *` never re-exports a default.
    return targetPath === undefined || exportedName === 'default'
      ? undefined
      : followExport(resolution, targetPath, exportedName);
  }
  const matchingExportSpecifier = namedExports.find(
    (exportSpecifier) => getAliasOrOwnName(exportSpecifier) === exportedName,
  );
  if (matchingExportSpecifier === undefined) {
    return undefined;
  }
  return targetPath === undefined
    ? {
        kind: ORIGIN_KIND.EXTERNAL,
        rewrittenSpecifier,
        importedName: matchingExportSpecifier.getName(),
      }
    : followExportOrKeepReference(resolution, targetPath, matchingExportSpecifier.getName());
};

// Where module `modulePath`'s export `exportedName` is bound, or `undefined`
// when it has no such export.
const followExport = (
  resolution: OriginResolution,
  modulePath: string,
  exportedName: string,
): Origin | undefined => {
  const moduleContext = resolution.originLookup.moduleContextByPath.get(modulePath);
  if (
    moduleContext === undefined ||
    resolution.visitedExportKeys.has(`${modulePath}:${exportedName}`)
  ) {
    return undefined;
  }
  resolution.visitedExportKeys.add(`${modulePath}:${exportedName}`);
  const localName = moduleContext.localNameByExportedName.get(exportedName);
  if (localName !== undefined) {
    return followLocalName(resolution, moduleContext, localName);
  }
  const declarationName = moduleContext.declarationNameByExportedName.get(exportedName);
  if (declarationName !== undefined) {
    return { kind: ORIGIN_KIND.LOCAL, modulePath, declarationName };
  }
  for (const exportDeclaration of moduleContext.scannedModule.sourceFile.getExportDeclarations()) {
    const reExportOrigin = followReExport({
      resolution,
      modulePath,
      exportDeclaration,
      exportedName,
    });
    if (reExportOrigin !== undefined) {
      return reExportOrigin;
    }
  }
  return undefined;
};

/** Where module `modulePath`'s export `exportedName` is bound, or `undefined` when it has no such export. */
export const findExportOrigin = (
  originLookup: OriginLookup,
  modulePath: string,
  exportedName: string,
): Origin | undefined => {
  return followExport({ originLookup, visitedExportKeys: new Set() }, modulePath, exportedName);
};

/** Where the top-level name `localName` of a module is bound. */
export const findLocalNameOrigin = (
  originLookup: OriginLookup,
  moduleContext: ModuleContext,
  localName: string,
): Origin => {
  return followLocalName({ originLookup, visitedExportKeys: new Set() }, moduleContext, localName);
};
