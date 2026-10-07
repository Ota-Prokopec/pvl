// Follows a name through imports and re-exports within the scanned set to
// where it is actually bound.
import { aliasOrName, type ModuleContext } from './context.js';
import { resolveScanned, rewriteSpecifier } from './modules.js';

/**
 * `LOCAL` is a top-level declaration of a scanned module; `EXTERNAL` is an
 * import from outside the set.
 */
export const ORIGIN_KIND = {
  LOCAL: 'LOCAL',
  EXTERNAL: 'EXTERNAL',
} as const;

/** Where a {@link ORIGIN_KIND.LOCAL} name is bound: a scanned module's own declaration. */
export type LocalOrigin = { kind: typeof ORIGIN_KIND.LOCAL; module: string; name: string };

/**
 * Where a name is bound. An {@link ORIGIN_KIND.EXTERNAL} origin's
 * `specifier` is already rewritten to resolve from the destination.
 */
export type Origin =
  LocalOrigin | { kind: typeof ORIGIN_KIND.EXTERNAL; specifier: string; imported: string };

/** Equal for two origins exactly when they are the same binding. */
export const originKey = (origin: Origin): string => {
  return origin.kind === ORIGIN_KIND.LOCAL
    ? `local:${origin.module}:${origin.name}`
    : `external:${origin.specifier}:${origin.imported}`;
};

export type OriginResolver = {
  /** Where module `path`'s export `name` is bound, or `undefined` when it has no such export. */
  resolveExport: (path: string, name: string) => Origin | undefined;
  /** Where the top-level name `local` of a module is bound. */
  resolveLocal: (context: ModuleContext, local: string) => Origin;
};

export type CreateOriginResolverArgs = {
  /** Every scanned module, in any order. */
  contexts: ReadonlyArray<ModuleContext>;
  scanned: ReadonlySet<string>;
  outputDirectory: string;
};

export const createOriginResolver = ({
  contexts,
  scanned,
  outputDirectory,
}: CreateOriginResolverArgs): OriginResolver => {
  const byPath = new Map(contexts.map((context) => [context.module.path, context]));
  // `seen` stops a re-export cycle, which only a type-only cycle can form.
  const resolveExport = (path: string, name: string, seen: Set<string>): Origin | undefined => {
    const context = byPath.get(path);
    if (context === undefined || seen.has(`${path}:${name}`)) {
      return undefined;
    }
    seen.add(`${path}:${name}`);
    const local = context.localExports.get(name);
    if (local !== undefined) {
      return resolveLocal(context, local, seen);
    }
    const declaredName = context.declaredExports.get(name);
    if (declaredName !== undefined) {
      return { kind: ORIGIN_KIND.LOCAL, module: path, name: declaredName };
    }
    for (const declaration of context.module.sourceFile.getExportDeclarations()) {
      const raw = declaration.getModuleSpecifierValue();
      if (raw === undefined) {
        continue;
      }
      const target = resolveScanned(raw, path, scanned);
      const specifier = rewriteSpecifier(raw, path, outputDirectory);
      const namespaceExport = declaration.getNamespaceExport();
      const named = declaration.getNamedExports();
      if (namespaceExport !== undefined) {
        if (namespaceExport.getName() === name) {
          return { kind: ORIGIN_KIND.EXTERNAL, specifier, imported: '*' };
        }
        continue;
      }
      if (named.length === 0) {
        const origin =
          target === undefined || name === 'default'
            ? undefined
            : resolveExport(target, name, seen);
        if (origin !== undefined) {
          return origin;
        }
        continue;
      }
      const match = named.find((specifierNode) => aliasOrName(specifierNode) === name);
      if (match !== undefined) {
        return target === undefined
          ? { kind: ORIGIN_KIND.EXTERNAL, specifier, imported: match.getName() }
          : resolveInto(target, match.getName(), seen);
      }
    }
    return undefined;
  };

  // A name the user's code says `target` exports; if it doesn't, the
  // reference is kept as written.
  const resolveInto = (target: string, name: string, seen: Set<string>): Origin => {
    return resolveExport(target, name, seen) ?? { kind: ORIGIN_KIND.LOCAL, module: target, name };
  };

  const resolveLocal = (context: ModuleContext, local: string, seen: Set<string>): Origin => {
    const binding = context.imports.find((candidate) => candidate.local === local);
    if (binding === undefined) {
      return { kind: ORIGIN_KIND.LOCAL, module: context.module.path, name: local };
    }
    return binding.target === undefined
      ? { kind: ORIGIN_KIND.EXTERNAL, specifier: binding.specifier, imported: binding.imported }
      : resolveInto(binding.target, binding.imported, seen);
  };

  return {
    resolveExport: (path, name) => resolveExport(path, name, new Set()),
    resolveLocal: (context, local) => resolveLocal(context, local, new Set()),
  };
};
