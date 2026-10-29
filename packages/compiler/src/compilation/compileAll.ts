// Compiles every scanned module into the Destination Directory's files
// (ADR-0005): `Module.compile` handles each module.
import type { MirroredFile, MirroredPath } from '../module/types.js';
import type { ScannedPath } from '../scanner/types.js';
import type { ModuleCompilation } from '../schemas/readSchema.js';

/**
 * Builds the Destination Directory's files from the scanned modules'
 * compilations, one per scanned module, only once the run raised no error: one
 * mirrored module per scanned module, compiled by `Module.compile` at its path
 * relative to the Root Directory.
 * Sorted by path, so the output doesn't depend on scan order.
 *
 * ```ts
 * // /repo/src/schemas/user.ts, /repo/src/schemas/order.ts scanned; rootDir /repo/src
 * compileAll([<user.ts>, <order.ts>])
 * // [{ relativePath: 'schemas/order.ts', … },
 * //  { relativePath: 'schemas/user.ts', … }]
 * ```
 */
export const compileAll = (compilations: ReadonlyArray<ModuleCompilation>): MirroredFile[] => {
  const modules = compilations.map(({ module }) => module);

  // Lets a rewritten import that points at another scanned file point at that
  // file's mirror instead.
  const mirroredPathByScannedPath = new Map<ScannedPath, MirroredPath>(
    modules.map(({ path, mirroredPath }) => [path.absolutePath, mirroredPath]),
  );

  const mirroredModules: MirroredFile[] = compilations.map(({ module, schemas }) =>
    module.compile({ schemas, mirroredPathByScannedPath }),
  );

  return mirroredModules.sort((first, second) =>
    first.relativePath < second.relativePath ? -1 : 1,
  );
};
