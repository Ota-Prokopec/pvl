// Mirrors the scanned set into the Destination File's text (ADR-0005): each
// step lives in its own module, and this one runs them in order.
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { ModuleContextReader, type ModuleContext } from './moduleContextReader.js';
import { planExports } from './exports.js';
import { TsMorphProject } from './tsMorphProject.js';
import { sortByDependencyOrder } from './utils.js';
import { OriginTracer } from './origins.js';
import { Precheck } from './precheck.js';
import { DestinationFileRenderer } from './render.js';
import { TopLevelScopeJoiner } from './scope.js';

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

/**
 * Builds the Destination File's text from the scanned files (ADR-0005): one
 * file holding every scanned module's code in dependency order, under one
 * top-level scope, importing only from outside the set.
 *
 * Returns the warnings with the text, or, when a scanned file can't be
 * mirrored, every error and warning the precheck found and empty text:
 *
 * - PARSE_FAILED: a file isn't valid syntax.
 * - NAMESPACE_IMPORT_OF_SCANNED_FILE: `import * as x from './scanned.js'`.
 * - IMPORT_CYCLE: scanned files import each other's values.
 * - DUPLICATE_EXPORT: two files export different bindings under one name.
 *
 * DUPLICATE_EXPORT is found while planning the exports, so it comes with
 * the text; the caller decides not to write it.
 */
export const mirrorScannedFiles = ({
  scannedFilePaths,
  baseDirectory,
  outputDirectory,
}: MirrorScannedFilesArgs): MirrorScannedFilesPayload => {
  const tsMorphProject = TsMorphProject.create();
  const scannedFilePathSet = new Set(scannedFilePaths);
  const scannedModules = TsMorphProject.readScannedModules(tsMorphProject, scannedFilePaths);
  const precheck = Precheck.run({
    tsMorphProject,
    scannedModules,
    scannedFilePaths: scannedFilePathSet,
    baseDirectory,
  });
  if (precheck.errors.length > 0) {
    return { diagnostics: [...precheck.errors, ...precheck.warnings], destinationFileText: '' };
  }

  const orderedModules = sortByDependencyOrder(scannedModules);
  const moduleContexts: ModuleContext[] = orderedModules.map((scannedModule) =>
    ModuleContextReader.read({
      scannedModule,
      scannedFilePaths: scannedFilePathSet,
      outputDirectory,
    }),
  );
  const originLookup = OriginTracer.createOriginLookup({
    moduleContexts,
    scannedFilePaths: scannedFilePathSet,
    outputDirectory,
  });
  // Planned against the names as written, before TopLevelScopeJoiner.join renames any.
  const exportPlan = planExports({ moduleContexts, originLookup, baseDirectory });
  const { finalNameByOriginKey, externalImports } = TopLevelScopeJoiner.join({
    moduleContexts,
    originLookup,
  });
  return {
    diagnostics: [...precheck.warnings, ...exportPlan.diagnostics],
    destinationFileText: DestinationFileRenderer.render({
      moduleContexts,
      exportPlan,
      finalNameByOriginKey,
      externalImports,
      baseDirectory,
      outputDirectory,
    }),
  };
};
