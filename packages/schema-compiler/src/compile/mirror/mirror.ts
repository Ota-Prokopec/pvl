// Mirrors the scanned set into the Destination File's text (ADR-0005): each
// step lives in its own module, and this one runs them in order.
import type { Diagnostic } from '../../diagnostics/diagnostic.js';
import { findBlockingErrors, findWarnings } from './checks.js';
import { readContext, type ModuleContext } from './context.js';
import { planExports } from './exports.js';
import { createProject, emissionOrder, readModules } from './modules.js';
import { createOriginResolver } from './origins.js';
import { renderDestinationFile } from './render.js';
import { joinScope } from './scope.js';

export type MirrorPayload = {
  diagnostics: Diagnostic[];
  /** The Destination File's text; empty when an error stopped the mirror. */
  content: string;
};

export type MirrorArgs = {
  /** The scanned files' absolute paths. */
  files: ReadonlyArray<string>;
  /** The directory each banner names its file relative to. */
  baseDirectory: string;
  /** The directory the Destination File lands in, which relative imports are rewritten against. */
  outputDirectory: string;
};

/** Builds the Destination File's text from the scanned files, and reports what blocks or degrades it. */
export const mirror = ({ files, baseDirectory, outputDirectory }: MirrorArgs): MirrorPayload => {
  const project = createProject();
  const scanned = new Set(files);
  const scannedModules = readModules(project, files);
  const errors = findBlockingErrors({ project, modules: scannedModules, scanned, baseDirectory });
  if (errors.length > 0) {
    return { diagnostics: errors, content: '' };
  }

  const modules = emissionOrder(scannedModules);
  const warnings = modules.flatMap(findWarnings);
  const contexts: ModuleContext[] = modules.map((module) =>
    readContext({ module, scanned, outputDirectory }),
  );
  const resolver = createOriginResolver({ contexts, scanned, outputDirectory });
  // Planned against the names as written, before joinScope renames any.
  const exportPlan = planExports({ contexts, resolver, scanned, baseDirectory, outputDirectory });
  const { finalNames, externalImports } = joinScope({ contexts, resolver });
  return {
    diagnostics: [...warnings, ...exportPlan.diagnostics],
    content: renderDestinationFile({
      contexts,
      exportPlan,
      finalNames,
      externalImports,
      baseDirectory,
      outputDirectory,
    }),
  };
};
