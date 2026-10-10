// Compiles every scanned module into the Destination Directory's files
// (ADR-0005): `Module.compile` handles each module, and this one adds the barrel.
import type { Project } from 'ts-morph';
import { BARREL_FILE_NAME } from '../consts.js';
import { Barrel } from '../barrel.js';
import type { MirroredFile, MirroredPath } from '../module.js';
import type { ScannedModuleCompilation } from './precheckScannedModules.js';
import type { ScannedPath } from '../scanner.js';

export type CompileAllArgs = {
  tsMorphProject: Project;
  /** One per scanned module, each of which passed `precheckScannedModules` without an error. */
  compilations: ReadonlyArray<ScannedModuleCompilation>;
};

/**
 * Builds the Destination Directory's files from the scanned modules: one
 * mirrored module per scanned module, compiled by `Module.compile` at its path
 * relative to the Root Directory, plus the generated barrel unless
 * `<rootDir>/index.ts` is itself scanned. Sorted by path, so the output
 * doesn't depend on scan order.
 *
 * ```ts
 * // /repo/src/schemas/user.ts, /repo/src/schemas/order.ts scanned; rootDir /repo/src
 * compileAll({ tsMorphProject, compilations: [<user.ts>, <order.ts>] })
 * // [{ relativePath: 'index.ts', … },
 * //  { relativePath: 'schemas/order.ts', … },
 * //  { relativePath: 'schemas/user.ts', … }]
 * ```
 */
export const compileAll = ({ tsMorphProject, compilations }: CompileAllArgs): MirroredFile[] => {
  const scannedModules = compilations.map(({ scannedModule }) => scannedModule);

  // Lets a rewritten import that points at another scanned file point at that
  // file's mirror instead.
  const mirroredPathByScannedPath = new Map<ScannedPath, MirroredPath>(
    scannedModules.map(({ absolutePath, mirroredPath }) => [absolutePath, mirroredPath]),
  );

  const mirroredModules: MirroredFile[] = compilations.map(
    ({ scannedModule, scannedModuleCompiler, sites }) =>
      scannedModule.compile({
        tsMorphProject,
        scannedModuleCompiler,
        sites,
        mirroredPathByScannedPath,
      }),
  );

  const barrel: MirroredFile[] = Barrel.hasScannedBarrel(scannedModules)
    ? []
    : [{ relativePath: BARREL_FILE_NAME, text: Barrel.renderBarrelFile(scannedModules) }];

  return [...barrel, ...mirroredModules].sort((first, second) =>
    first.relativePath < second.relativePath ? -1 : 1,
  );
};
