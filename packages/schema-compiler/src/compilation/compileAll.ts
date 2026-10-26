// Compiles every scanned module into the Destination Directory's files
// (ADR-0005): `Module.compile` handles each module.
import type { Project } from 'ts-morph';
import type { MirroredFile, MirroredPath } from '../module.js';
import type { ScannedPath } from '../scanner.js';
import type { ModuleCompilation } from '../schemas/readSchema.js';

export type CompileAllArgs = {
  tsMorphProject: Project;
  /** One per scanned module, each of which passed `Precheck.precheckModules` without an error. */
  compilations: ReadonlyArray<ModuleCompilation>;
  /** Whether each mirrored module ends with its exported Schemas' type aliases (the `withTypes` setting). */
  withTypes: boolean;
};

/**
 * Builds the Destination Directory's files from the scanned modules: one
 * mirrored module per scanned module, compiled by `Module.compile` at its path
 * relative to the Root Directory.
 * Sorted by path, so the output doesn't depend on scan order.
 *
 * ```ts
 * // /repo/src/schemas/user.ts, /repo/src/schemas/order.ts scanned; rootDir /repo/src
 * compileAll({ tsMorphProject, compilations: [<user.ts>, <order.ts>], withTypes: true })
 * // [{ relativePath: 'schemas/order.ts', … },
 * //  { relativePath: 'schemas/user.ts', … }]
 * ```
 */
export const compileAll = ({
  tsMorphProject,
  compilations,
  withTypes,
}: CompileAllArgs): MirroredFile[] => {
  const modules = compilations.map(({ module }) => module);

  // Lets a rewritten import that points at another scanned file point at that
  // file's mirror instead.
  const mirroredPathByScannedPath = new Map<ScannedPath, MirroredPath>(
    modules.map(({ path, mirroredPath }) => [path.absolutePath, mirroredPath]),
  );

  const mirroredModules: MirroredFile[] = compilations.map(({ module, schemas }) =>
    module.compile({
      tsMorphProject,
      schemas,
      mirroredPathByScannedPath,
      withTypes,
    }),
  );

  return mirroredModules.sort((first, second) =>
    first.relativePath < second.relativePath ? -1 : 1,
  );
};
