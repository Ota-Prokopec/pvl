// Path helpers and the module-graph order the Destination File is emitted in.
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import type { ScannedModule } from './tsMorphProject.js';

/** `path` with the platform's separators replaced by `/`. */
export const toPosixPath = (path: string): string => {
  return path.split(sep).join(posix.sep);
};

/** `path` as a banner or diagnostic shows it: relative to `baseDirectory`, with `/` separators. */
export const toDisplayPath = (baseDirectory: string, path: string): string => {
  return toPosixPath(relative(baseDirectory, path));
};

/** Whether `specifier` names a file by path, rather than a package resolved through `node_modules`. */
export const isRelativeOrAbsoluteSpecifier = (specifier: string): boolean => {
  return specifier.startsWith('.') || isAbsolute(specifier);
};

/**
 * `specifier`, rewritten so it resolves from `outputDirectory` as it did from
 * `importerPath`. A bare specifier resolves through `node_modules` and is
 * kept as written.
 */
export const rewriteSpecifierForOutputDirectory = (
  specifier: string,
  importerPath: string,
  outputDirectory: string,
): string => {
  if (!isRelativeOrAbsoluteSpecifier(specifier)) {
    return specifier;
  }
  const pathFromOutputDirectory = toPosixPath(
    relative(outputDirectory, resolve(dirname(importerPath), specifier)),
  );
  return pathFromOutputDirectory.startsWith('.')
    ? pathFromOutputDirectory
    : `./${pathFromOutputDirectory}`;
};

/**
 * The modules with every dependency before its dependents, ties broken by
 * path so the order is stable. Modules caught in a cycle are left out; see
 * {@link findImportCycles}.
 */
export const sortByDependencyOrder = (
  scannedModules: ReadonlyArray<ScannedModule>,
): ScannedModule[] => {
  const unorderedModules = [...scannedModules].sort((a, b) => (a.path < b.path ? -1 : 1));
  const orderedPaths = new Set<string>();
  const orderedModules: ScannedModule[] = [];
  let nextReadyModule = unorderedModules.find((module) =>
    [...module.dependencies].every((dependencyPath) => orderedPaths.has(dependencyPath)),
  );
  while (nextReadyModule !== undefined) {
    orderedModules.push(nextReadyModule);
    orderedPaths.add(nextReadyModule.path);
    unorderedModules.splice(unorderedModules.indexOf(nextReadyModule), 1);
    nextReadyModule = unorderedModules.find((module) =>
      [...module.dependencies].every((dependencyPath) => orderedPaths.has(dependencyPath)),
    );
  }
  return orderedModules;
};

// The shortest dependency path from `start` back to itself, or `undefined`
// when `start` isn't on a cycle.
const findShortestCycleThrough = (
  startPath: string,
  moduleByPath: ReadonlyMap<string, ScannedModule>,
): string[] | undefined => {
  const predecessorByPath = new Map<string, string>();
  const pathsToVisit = [startPath];
  for (const currentPath of pathsToVisit) {
    for (const dependency of [...(moduleByPath.get(currentPath)?.dependencies ?? [])].sort()) {
      if (dependency === startPath) {
        const cyclePaths = [currentPath];
        let stepPath = currentPath;
        while (stepPath !== startPath) {
          stepPath = predecessorByPath.get(stepPath) ?? startPath;
          cyclePaths.unshift(stepPath);
        }
        return [...cyclePaths, startPath];
      }
      if (!predecessorByPath.has(dependency)) {
        predecessorByPath.set(dependency, currentPath);
        pathsToVisit.push(dependency);
      }
    }
  }
  return undefined;
};

/**
 * Each import cycle among the modules, as the paths around it from its
 * first path back to that path. A module on several cycles is reported on
 * one.
 */
export const findImportCycles = (scannedModules: ReadonlyArray<ScannedModule>): string[][] => {
  const moduleByPath = new Map(scannedModules.map((module) => [module.path, module]));
  const orderedPaths = new Set(sortByDependencyOrder(scannedModules).map(({ path }) => path));
  const pathsOnReportedCycles = new Set<string>();
  const importCycles: string[][] = [];
  for (const path of [...moduleByPath.keys()].sort()) {
    if (orderedPaths.has(path) || pathsOnReportedCycles.has(path)) {
      continue;
    }
    const cyclePaths = findShortestCycleThrough(path, moduleByPath);
    if (cyclePaths !== undefined) {
      importCycles.push(cyclePaths);
      cyclePaths.forEach((cyclePath) => pathsOnReportedCycles.add(cyclePath));
    }
  }
  return importCycles;
};
