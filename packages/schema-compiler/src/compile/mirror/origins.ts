// Follows a name through imports and re-exports within the scanned set to
// where it is actually bound.
import type { ExportDeclaration } from 'ts-morph';
import { aliasOrName, type ModuleContext } from './context.js';
import { resolveScanned } from './tsMorphProject.js';
import { rewriteSpecifier } from './utils.js';

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

/** What resolving an origin reads: every scanned module, by path. */
export type OriginLookup = {
  contexts: ReadonlyMap<string, ModuleContext>;
  scanned: ReadonlySet<string>;
  outputDirectory: string;
};

export type CreateOriginLookupArgs = {
  /** Every scanned module, in any order. */
  contexts: ReadonlyArray<ModuleContext>;
  scanned: ReadonlySet<string>;
  outputDirectory: string;
};

export const createOriginLookup = ({
  contexts,
  scanned,
  outputDirectory,
}: CreateOriginLookupArgs): OriginLookup => {
  return {
    contexts: new Map(contexts.map((context) => [context.module.path, context])),
    scanned,
    outputDirectory,
  };
};

// One resolution in progress. `seen` stops a re-export cycle, which only a
// type-only cycle can form.
type Walk = {
  lookup: OriginLookup;
  seen: Set<string>;
};

// Where `target`'s export `name` is bound; if the user's code names an
// export `target` doesn't have, the reference is kept as written.
const originIn = (walk: Walk, target: string, name: string): Origin => {
  return exportOrigin(walk, target, name) ?? { kind: ORIGIN_KIND.LOCAL, module: target, name };
};

const localOrigin = (walk: Walk, context: ModuleContext, local: string): Origin => {
  const binding = context.imports.find((candidate) => candidate.local === local);
  if (binding === undefined) {
    return { kind: ORIGIN_KIND.LOCAL, module: context.module.path, name: local };
  }
  return binding.target === undefined
    ? { kind: ORIGIN_KIND.EXTERNAL, specifier: binding.specifier, imported: binding.imported }
    : originIn(walk, binding.target, binding.imported);
};

type ReExportOriginArgs = {
  walk: Walk;
  path: string;
  declaration: ExportDeclaration;
  name: string;
};

// Where `export … from` in module `path` binds `name`, or `undefined` when
// it doesn't export that name.
const reExportOrigin = ({
  walk,
  path,
  declaration,
  name,
}: ReExportOriginArgs): Origin | undefined => {
  const raw = declaration.getModuleSpecifierValue();
  if (raw === undefined) {
    return undefined;
  }
  const target = resolveScanned(raw, path, walk.lookup.scanned);
  const specifier = rewriteSpecifier(raw, path, walk.lookup.outputDirectory);
  const namespaceExport = declaration.getNamespaceExport();
  if (namespaceExport !== undefined) {
    return namespaceExport.getName() === name
      ? { kind: ORIGIN_KIND.EXTERNAL, specifier, imported: '*' }
      : undefined;
  }
  const named = declaration.getNamedExports();
  if (named.length === 0) {
    // `export *` never re-exports a default.
    return target === undefined || name === 'default'
      ? undefined
      : exportOrigin(walk, target, name);
  }
  const match = named.find((specifierNode) => aliasOrName(specifierNode) === name);
  if (match === undefined) {
    return undefined;
  }
  return target === undefined
    ? { kind: ORIGIN_KIND.EXTERNAL, specifier, imported: match.getName() }
    : originIn(walk, target, match.getName());
};

const exportOrigin = (walk: Walk, path: string, name: string): Origin | undefined => {
  const context = walk.lookup.contexts.get(path);
  if (context === undefined || walk.seen.has(`${path}:${name}`)) {
    return undefined;
  }
  walk.seen.add(`${path}:${name}`);
  const local = context.localExports.get(name);
  if (local !== undefined) {
    return localOrigin(walk, context, local);
  }
  const declaredName = context.declaredExports.get(name);
  if (declaredName !== undefined) {
    return { kind: ORIGIN_KIND.LOCAL, module: path, name: declaredName };
  }
  for (const declaration of context.module.sourceFile.getExportDeclarations()) {
    const origin = reExportOrigin({ walk, path, declaration, name });
    if (origin !== undefined) {
      return origin;
    }
  }
  return undefined;
};

/** Where module `path`'s export `name` is bound, or `undefined` when it has no such export. */
export const resolveExport = (
  lookup: OriginLookup,
  path: string,
  name: string,
): Origin | undefined => {
  return exportOrigin({ lookup, seen: new Set() }, path, name);
};

/** Where the top-level name `local` of a module is bound. */
export const resolveLocal = (
  lookup: OriginLookup,
  context: ModuleContext,
  local: string,
): Origin => {
  return localOrigin({ lookup, seen: new Set() }, context, local);
};
