// Reads the scanned files into a module graph: which import or re-export
// points into the scanned set, and the order the modules must be emitted in.
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import {
  Node,
  Project,
  ts,
  type ExportDeclaration,
  type ImportDeclaration,
  type SourceFile,
} from 'ts-morph';

/** Bundler resolution, so `./user.js` finds `user.ts` the way the user's own build does. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
  allowImportingTsExtensions: true,
  noEmit: true,
};

/** One scanned file. */
export type ScannedModule = {
  /** Absolute. */
  path: string;
  sourceFile: SourceFile;
  /** The scanned modules this one needs evaluated first: its value imports and re-exports into the set. */
  dependencies: Set<string>;
};

export const toPosix = (path: string): string => {
  return path.split(sep).join(posix.sep);
};

/** `path` as a banner or diagnostic shows it: relative to `baseDirectory`, with `/` separators. */
export const displayPath = (baseDirectory: string, path: string): string => {
  return toPosix(relative(baseDirectory, path));
};

export const createProject = (): Project => {
  return new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: COMPILER_OPTIONS });
};

const isPathSpecifier = (specifier: string): boolean => {
  return specifier.startsWith('.') || isAbsolute(specifier);
};

/** The scanned file `specifier` resolves to from `containingFile`, or `undefined` when it leaves the set. */
export const resolveScanned = (
  specifier: string,
  containingFile: string,
  scanned: ReadonlySet<string>,
): string | undefined => {
  if (!isPathSpecifier(specifier)) {
    return undefined;
  }
  const resolved = ts.resolveModuleName(specifier, containingFile, COMPILER_OPTIONS, ts.sys)
    .resolvedModule?.resolvedFileName;
  if (resolved === undefined) {
    return undefined;
  }
  const absolute = resolve(resolved);
  return scanned.has(absolute) ? absolute : undefined;
};

/**
 * `specifier`, rewritten so it resolves from `outputDirectory` as it did from
 * `containingFile`. A bare specifier resolves through `node_modules` and is
 * kept as written.
 */
export const rewriteSpecifier = (
  specifier: string,
  containingFile: string,
  outputDirectory: string,
): string => {
  if (!isPathSpecifier(specifier)) {
    return specifier;
  }
  const fromOutput = toPosix(
    relative(outputDirectory, resolve(dirname(containingFile), specifier)),
  );
  return fromOutput.startsWith('.') ? fromOutput : `./${fromOutput}`;
};

// Whether evaluating the importing module needs `declaration`'s target
// evaluated first. A type-only import or re-export is erased.
const isValueEdge = (declaration: ImportDeclaration | ExportDeclaration): boolean => {
  if (declaration.isTypeOnly()) {
    return false;
  }
  if (Node.isImportDeclaration(declaration)) {
    const named = declaration.getNamedImports();
    return (
      declaration.getDefaultImport() !== undefined ||
      declaration.getNamespaceImport() !== undefined ||
      named.length === 0 ||
      named.some((specifier) => !specifier.isTypeOnly())
    );
  }
  const named = declaration.getNamedExports();
  return named.length === 0 || named.some((specifier) => !specifier.isTypeOnly());
};

/** Adds every file to `project` and links each to the scanned modules it depends on. */
export const readModules = (project: Project, files: ReadonlyArray<string>): ScannedModule[] => {
  const scanned = new Set(files);
  return files.map((path) => {
    const sourceFile = project.addSourceFileAtPath(path);
    const dependencies = new Set<string>();
    for (const declaration of [
      ...sourceFile.getImportDeclarations(),
      ...sourceFile.getExportDeclarations(),
    ]) {
      const specifier = declaration.getModuleSpecifierValue();
      const target = specifier === undefined ? undefined : resolveScanned(specifier, path, scanned);
      if (target !== undefined && isValueEdge(declaration)) {
        dependencies.add(target);
      }
    }
    return { path, sourceFile, dependencies };
  });
};

/**
 * The modules with every dependency before its dependents, ties broken by
 * path so the order is stable. Modules caught in a cycle are left out; see
 * {@link findCycles}.
 */
export const emissionOrder = (modules: ReadonlyArray<ScannedModule>): ScannedModule[] => {
  const pending = [...modules].sort((a, b) => (a.path < b.path ? -1 : 1));
  const emitted = new Set<string>();
  const order: ScannedModule[] = [];
  let next = pending.find((module) => [...module.dependencies].every((dep) => emitted.has(dep)));
  while (next !== undefined) {
    order.push(next);
    emitted.add(next.path);
    pending.splice(pending.indexOf(next), 1);
    next = pending.find((module) => [...module.dependencies].every((dep) => emitted.has(dep)));
  }
  return order;
};

// The shortest dependency path from `start` back to itself, or `undefined`
// when `start` isn't on a cycle.
const cycleThrough = (
  start: string,
  byPath: ReadonlyMap<string, ScannedModule>,
): string[] | undefined => {
  const previous = new Map<string, string>();
  const queue = [start];
  for (const current of queue) {
    for (const dependency of [...(byPath.get(current)?.dependencies ?? [])].sort()) {
      if (dependency === start) {
        const cycle = [current];
        let step = current;
        while (step !== start) {
          step = previous.get(step) ?? start;
          cycle.unshift(step);
        }
        return [...cycle, start];
      }
      if (!previous.has(dependency)) {
        previous.set(dependency, current);
        queue.push(dependency);
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
export const findCycles = (modules: ReadonlyArray<ScannedModule>): string[][] => {
  const byPath = new Map(modules.map((module) => [module.path, module]));
  const emitted = new Set(emissionOrder(modules).map(({ path }) => path));
  const reported = new Set<string>();
  const cycles: string[][] = [];
  for (const path of [...byPath.keys()].sort()) {
    if (emitted.has(path) || reported.has(path)) {
      continue;
    }
    const cycle = cycleThrough(path, byPath);
    if (cycle !== undefined) {
      cycles.push(cycle);
      cycle.forEach((member) => reported.add(member));
    }
  }
  return cycles;
};
