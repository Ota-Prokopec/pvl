// Mirrors the scanned set into the Destination File's text (ADR-0005): each
// step lives in its own module, and this one runs them in order.
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { findBlockingErrors, createModuleWarnings } from './checks.js';
import { readModuleContext, type ModuleContext } from './context.js';
import { planExports } from './exports.js';
import { createTsMorphProject, readScannedModules } from './tsMorphProject.js';
import { sortByDependencyOrder } from './utils.js';
import { createOriginLookup } from './origins.js';
import { renderDestinationFile } from './render.js';
import { joinIntoOneTopLevelScope } from './scope.js';

export type MirrorScannedFilesPayload = {
  diagnostics: Diagnostic[];
  /** The Destination File's text; empty when an error stopped the mirror. */
  destinationFileText: string;
};

export type MirrorScannedFilesArgs = {
  /** The scanned files' absolute paths. */
  scannedFilePaths: ReadonlyArray<string>;
  /** The directory each banner names its file relative to. */
  baseDirectory: string;
  /** The directory the Destination File lands in, which relative imports are rewritten against. */
  outputDirectory: string;
};

/** Builds the Destination File's text from the scanned files, and reports what blocks or degrades it. */
export const mirrorScannedFiles = ({
  scannedFilePaths,
  baseDirectory,
  outputDirectory,
}: MirrorScannedFilesArgs): MirrorScannedFilesPayload => {
  const tsMorphProject = createTsMorphProject();
  const scannedFilePathSet = new Set(scannedFilePaths);
  const scannedModules = readScannedModules(tsMorphProject, scannedFilePaths);
  const blockingErrors = findBlockingErrors({
    tsMorphProject,
    scannedModules,
    scannedFilePaths: scannedFilePathSet,
    baseDirectory,
  });
  if (blockingErrors.length > 0) {
    return { diagnostics: blockingErrors, destinationFileText: '' };
  }

  const orderedModules = sortByDependencyOrder(scannedModules);
  const moduleWarnings = orderedModules.flatMap(createModuleWarnings);
  const moduleContexts: ModuleContext[] = orderedModules.map((scannedModule) =>
    readModuleContext({ scannedModule, scannedFilePaths: scannedFilePathSet, outputDirectory }),
  );
  const originLookup = createOriginLookup({
    moduleContexts,
    scannedFilePaths: scannedFilePathSet,
    outputDirectory,
  });
  // Planned against the names as written, before joinIntoOneTopLevelScope renames any.
  const exportPlan = planExports({ moduleContexts, originLookup, baseDirectory });
  const { finalNameByOriginKey, externalImports } = joinIntoOneTopLevelScope({
    moduleContexts,
    originLookup,
  });
  return {
    diagnostics: [...moduleWarnings, ...exportPlan.diagnostics],
    destinationFileText: renderDestinationFile({
      moduleContexts,
      exportPlan,
      finalNameByOriginKey,
      externalImports,
      baseDirectory,
      outputDirectory,
    }),
  };
};
