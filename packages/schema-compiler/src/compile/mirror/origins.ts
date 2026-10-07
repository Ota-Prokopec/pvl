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

/**
 * A string equal for two origins exactly when they are the same binding,
 * to key maps and sets by binding.
 *
 * ```ts
 * toOriginKey({ kind: 'LOCAL', modulePath: '/repo/src/user.ts', declarationName: 'user' })
 * // 'local:/repo/src/user.ts:user'
 * toOriginKey({ kind: 'EXTERNAL', rewrittenSpecifier: '@pvl/schema', importedName: 'pvl' })
 * // 'external:@pvl/schema:pvl'
 * ```
 */
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

/**
 * Indexes every scanned module by its path, so {@link findExportOrigin} and
 * {@link findLocalNameOrigin} can step from an import into the module it
 * names.
 */
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

// One resolution in progress. `visitedExportKeys` holds each
// `<module path>:<exported name>` already followed, so a re-export cycle
// ends instead of looping; only a type-only cycle can form one, as
// IMPORT_CYCLE blocks the rest.
type OriginResolution = {
  originLookup: OriginLookup;
  visitedExportKeys: Set<string>;
};

// Where module `targetPath`'s export `exportedName` is bound. When the
// module has no such export, which TypeScript would have rejected, the
// reference is kept as written, as a binding `exportedName` of that module:
//
//   import { missing } from './user.js';  // → LOCAL user.ts `missing`
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

// Where the top-level name `localName` of a module is bound, following
// imports into the scanned set until it reaches a declaration or leaves
// the set. In post.ts:
//
//   const draft = …;                    // `draft` → LOCAL post.ts `draft`
//   import { pvl } from '@pvl/schema';  // `pvl`   → EXTERNAL '@pvl/schema' `pvl`
//   import { user } from './user.js';   // `user`  → wherever user.ts's export
//                                       //           `user` is bound
const followLocalName = (
  resolution: OriginResolution,
  moduleContext: ModuleContext,
  localName: string,
): Origin => {
  const importBinding = moduleContext.importBindings.find(
    (candidateBinding) => candidateBinding.localName === localName,
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

// Where the re-export `exportDeclaration` in module `modulePath` binds
// `exportedName`, or `undefined` when that declaration doesn't export it.
// Looking for `user`:
//
//   export { user } from './user.js';          // → user.ts's export `user`
//   export { account as user } from './a.js';  // → a.ts's export `account`
//   export * from './user.js';                 // → user.ts's export `user`, if any
//   export * as user from 'some-package';      // → EXTERNAL 'some-package' `*`
//   export { user } from 'some-package';       // → EXTERNAL 'some-package' `user`
//   export { post } from './post.js';          // → undefined: not `user`
//   export { user };                           // → undefined: not a re-export
//
// `export *` never re-exports a default, so it never matches `default`.
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

// Where module `modulePath`'s export `exportedName` is bound, or
// `undefined` when it has no such export or isn't scanned. Tries, in order:
//
//   export { user };  /  export default user;   // the local name, followed further
//   export const user = …;                       // the declaration itself
//   export { user } from './other.js';           // the re-export, followed further
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

/**
 * Where scanned module `modulePath`'s export `exportedName` is actually
 * bound, following re-exports through the scanned set, or `undefined` when
 * it has no such export.
 *
 * ```ts
 * // index.ts: export { user as account } from './user.js';
 * // user.ts:  import { base } from './base.js'; export const user = base;
 * findExportOrigin(lookup, '/repo/src/index.ts', 'account')
 * // { kind: 'LOCAL', modulePath: '/repo/src/user.ts', declarationName: 'user' }
 * ```
 */
export const findExportOrigin = (
  originLookup: OriginLookup,
  modulePath: string,
  exportedName: string,
): Origin | undefined => {
  return followExport({ originLookup, visitedExportKeys: new Set() }, modulePath, exportedName);
};

/**
 * Where the top-level name `localName` of a module is actually bound: the
 * module's own declaration, or, for an import, the declaration in the
 * scanned set it leads to, or the import from outside the set it ends at.
 *
 * ```ts
 * // post.ts: import { account } from './index.js';
 * // index.ts: export { user as account } from './user.js';
 * findLocalNameOrigin(lookup, postContext, 'account')
 * // { kind: 'LOCAL', modulePath: '/repo/src/user.ts', declarationName: 'user' }
 * ```
 */
export const findLocalNameOrigin = (
  originLookup: OriginLookup,
  moduleContext: ModuleContext,
  localName: string,
): Origin => {
  return followLocalName({ originLookup, visitedExportKeys: new Set() }, moduleContext, localName);
};
