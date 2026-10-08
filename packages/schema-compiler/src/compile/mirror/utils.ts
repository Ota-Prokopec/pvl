// Path helpers, free-name lookup and the module-graph order the Destination File is emitted in.
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import type { ScannedModule } from './tsMorphProject.js';

/**
 * `path` with the platform's separators replaced by `/`, so the Destination
 * File and the diagnostics read the same on Windows as elsewhere.
 *
 * ```ts
 * toPosixPath('src\\schemas\\user.ts') // 'src/schemas/user.ts' on Windows
 * toPosixPath('src/schemas/user.ts')   // unchanged on macOS and Linux
 * ```
 */
export const toPosixPath = (path: string): string => {
  return path.split(sep).join(posix.sep);
};

/**
 * `path` as a module banner or a diagnostic shows it: relative to
 * `baseDirectory`, with `/` separators.
 *
 * ```ts
 * toDisplayPath('/repo', '/repo/src/schemas/user.ts') // 'src/schemas/user.ts'
 * // In the Destination File: // ---- src/schemas/user.ts ----
 * ```
 */
export const toDisplayPath = (baseDirectory: string, path: string): string => {
  return toPosixPath(relative(baseDirectory, path));
};

/**
 * The first of `name`, `name_2`, `name_3`, … that `isTaken` rejects, so a
 * binding renamed to it can't clash with one already holding a name.
 *
 * ```ts
 * findFreeName('user', (candidate) => candidate === 'other')          // 'user'
 * findFreeName('user', (candidate) => candidate === 'user')           // 'user_2'
 * findFreeName('user', (candidate) => ['user', 'user_2'].includes(candidate)) // 'user_3'
 * ```
 */
export const findFreeName = (name: string, isTaken: (candidate: string) => boolean): string => {
  let freeName = name;
  let suffix = 1;
  while (isTaken(freeName)) {
    suffix += 1;
    freeName = `${name}_${String(suffix)}`;
  }
  return freeName;
};

/**
 * Whether `moduleSpecifier` names a file by its path, rather than a package
 * that resolves through `node_modules`.
 *
 * ```ts
 * isRelativeOrAbsoluteModuleSpecifier('./user.js')        // true
 * isRelativeOrAbsoluteModuleSpecifier('../helpers.js')    // true
 * isRelativeOrAbsoluteModuleSpecifier('/repo/src/a.js')   // true
 * isRelativeOrAbsoluteModuleSpecifier('@pvl/schema')      // false
 * isRelativeOrAbsoluteModuleSpecifier('node:path')        // false
 * ```
 */
export const isRelativeOrAbsoluteModuleSpecifier = (moduleSpecifier: string): boolean => {
  return moduleSpecifier.startsWith('.') || isAbsolute(moduleSpecifier);
};

/**
 * `moduleSpecifier` is rewritten to a path so it can be imported from
 * `outputDirectory`. It reaches the same file it reached from `importerPath`.
 * A package name module specifier (`@pvl/schema`) is kept, as it resolves the same.
 *
 * With `importerPath` `/repo/src/schemas/user.ts` and `outputDirectory`
 * `/repo/src/generated`:
 *
 * ```ts
 * rewriteModuleSpecifierForOutputDirectory('../helpers.js', …) // '../helpers.js'
 * rewriteModuleSpecifierForOutputDirectory('./tags.js', …)     // '../schemas/tags.js'
 * rewriteModuleSpecifierForOutputDirectory('@pvl/schema', …)   // '@pvl/schema', kept
 * ```
 */
export const rewriteModuleSpecifierForOutputDirectory = (
  moduleSpecifier: string,
  importerPath: string,
  outputDirectory: string,
): string => {
  if (!isRelativeOrAbsoluteModuleSpecifier(moduleSpecifier)) {
    return moduleSpecifier;
  }
  const pathFromOutputDirectory = toPosixPath(
    relative(outputDirectory, resolve(dirname(importerPath), moduleSpecifier)),
  );
  return pathFromOutputDirectory.startsWith('.')
    ? pathFromOutputDirectory
    : `./${pathFromOutputDirectory}`;
};

/**
 * The scanned modules ordered so each comes after every module it depends
 * on, which is the order the Destination File emits them in. Among modules
 * that are ready at the same time, the one with the alphabetically first
 * path goes first, so the order never changes between runs.
 *
 * ```text
 * post.ts depends on user.ts, user.ts and tag.ts depend on nothing
 * → tag.ts, user.ts, post.ts
 * ```
 *
 * A module on an import cycle can never become ready, so it, and every
 * module depending on it, is left out; {@link findImportCycles} reports it.
 */
export const sortByDependencyOrder = (
  scannedModules: ReadonlyArray<ScannedModule>,
): ScannedModule[] => {
  const unorderedModules = [...scannedModules].sort((first, second) =>
    first.path < second.path ? -1 : 1,
  );
  const orderedPaths = new Set<string>();
  const orderedModules: ScannedModule[] = [];
  let nextReadyModule = unorderedModules.find((candidateModule) =>
    [...candidateModule.dependencies].every((dependencyPath) => orderedPaths.has(dependencyPath)),
  );
  while (nextReadyModule !== undefined) {
    orderedModules.push(nextReadyModule);
    orderedPaths.add(nextReadyModule.path);
    unorderedModules.splice(unorderedModules.indexOf(nextReadyModule), 1);
    nextReadyModule = unorderedModules.find((candidateModule) =>
      [...candidateModule.dependencies].every((dependencyPath) => orderedPaths.has(dependencyPath)),
    );
  }
  return orderedModules;
};

// The shortest chain of dependencies leading from `startPath` back to
// itself, as the paths along it with `startPath` at both ends, or
// `undefined` when `startPath` isn't on a cycle. Found breadth-first, so
// the shortest chain wins.
//
//   a.ts → b.ts → a.ts, and a.ts → c.ts → d.ts → a.ts
//   findShortestCycleThrough('a.ts', …) // ['a.ts', 'b.ts', 'a.ts']
//   findShortestCycleThrough('e.ts', …) // undefined when nothing leads back
const findShortestCycleThrough = (
  startPath: string,
  moduleByPath: ReadonlyMap<string, ScannedModule>,
): string[] | undefined => {
  const predecessorByPath = new Map<string, string>();
  const pathsToVisit = [startPath];
  for (const currentPath of pathsToVisit) {
    for (const dependencyPath of [...(moduleByPath.get(currentPath)?.dependencies ?? [])].sort()) {
      if (dependencyPath === startPath) {
        const cyclePaths = [currentPath];
        let stepPath = currentPath;
        while (stepPath !== startPath) {
          stepPath = predecessorByPath.get(stepPath) ?? startPath;
          cyclePaths.unshift(stepPath);
        }
        return [...cyclePaths, startPath];
      }
      if (!predecessorByPath.has(dependencyPath)) {
        predecessorByPath.set(dependencyPath, currentPath);
        pathsToVisit.push(dependencyPath);
      }
    }
  }
  return undefined;
};

/**
 * Every import cycle among the scanned modules, each as the paths around
 * it, starting and ending at its alphabetically first path. A module on
 * several cycles is reported on only one, so one broken import doesn't
 * produce a pile of errors.
 *
 * ```text
 * a.ts imports b.ts, b.ts imports a.ts, c.ts imports a.ts
 * → [['a.ts', 'b.ts', 'a.ts']]
 * ```
 *
 * c.ts depends on the cycle but isn't on it, so it isn't reported.
 */
export const findImportCycles = (scannedModules: ReadonlyArray<ScannedModule>): string[][] => {
  const moduleByPath = new Map(
    scannedModules.map((scannedModule) => [scannedModule.path, scannedModule]),
  );
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
