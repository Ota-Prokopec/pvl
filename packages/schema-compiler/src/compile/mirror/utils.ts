// Path helpers and the module-graph order the Destination File is emitted in.
import { dirname, isAbsolute, posix, relative, resolve, sep } from 'node:path';
import type { ScannedModule } from './tsMorphProject.js';

export const toPosix = (path: string): string => {
  return path.split(sep).join(posix.sep);
};

/** `path` as a banner or diagnostic shows it: relative to `baseDirectory`, with `/` separators. */
export const displayPath = (baseDirectory: string, path: string): string => {
  return toPosix(relative(baseDirectory, path));
};

export const isPathSpecifier = (specifier: string): boolean => {
  return specifier.startsWith('.') || isAbsolute(specifier);
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
