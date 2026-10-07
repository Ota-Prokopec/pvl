// Joins the modules into the Destination File's one top-level scope. An
// import into the set collapses into a reference to the binding it names.
// Exported names keep theirs; every other binding takes its name unless a
// different binding already has it, and is renamed to `<name>_<n>` otherwise.
import type { ImportBinding, ModuleContext } from './context.js';
import { ORIGIN_KIND, originKey, type LocalOrigin, type OriginResolver } from './origins.js';

// An import into the set that becomes a reference to `origin`.
type Collapse = {
  binding: ImportBinding;
  origin: LocalOrigin;
};

type SplitImportsPayload = {
  collapses: Collapse[];
  externalImports: ImportBinding[];
};

// Each import is from outside the set, or into it. One into the set
// resolves to a scanned module's declaration, or through it to an import
// from outside, which then stands in for it.
const splitImports = (
  contexts: ReadonlyArray<ModuleContext>,
  resolver: OriginResolver,
): SplitImportsPayload => {
  const collapses: Collapse[] = [];
  const externalImports: ImportBinding[] = [];
  for (const context of contexts) {
    for (const binding of context.imports) {
      const origin =
        binding.target === undefined ? undefined : resolver.resolveLocal(context, binding.local);
      if (origin === undefined) {
        externalImports.push(binding);
      } else if (origin.kind === ORIGIN_KIND.LOCAL) {
        collapses.push({ binding, origin });
      } else {
        const { specifier, imported } = origin;
        externalImports.push({ ...binding, specifier, imported, target: undefined });
      }
    }
  }
  return { collapses, externalImports };
};

// Renames every clashing binding in its module, updating each external
// import's `local` in place, and returns origin key → final name for each
// non-exported declaration.
const assignNames = (
  contexts: ReadonlyArray<ModuleContext>,
  externalImports: ReadonlyArray<ImportBinding>,
): Map<string, string> => {
  const owners = new Map<string, string>();
  for (const { module, declared } of contexts) {
    for (const { name } of declared.filter(({ exportedAsItself }) => exportedAsItself)) {
      owners.set(name, originKey({ kind: ORIGIN_KIND.LOCAL, module: module.path, name }));
    }
  }
  const claim = (name: string, owner: string, rename: (name: string) => void): string => {
    const current = owners.get(name);
    if (current === undefined || current === owner) {
      owners.set(name, owner);
      return name;
    }
    let suffix = 2;
    while (owners.has(`${name}_${String(suffix)}`)) {
      suffix += 1;
    }
    const renamed = `${name}_${String(suffix)}`;
    owners.set(renamed, owner);
    rename(renamed);
    return renamed;
  };

  const finalNames = new Map<string, string>();
  for (const { module, declared } of contexts) {
    for (const { name, rename } of declared.filter(({ exportedAsItself }) => !exportedAsItself)) {
      const owner = originKey({ kind: ORIGIN_KIND.LOCAL, module: module.path, name });
      finalNames.set(owner, claim(name, owner, rename));
    }
    for (const binding of externalImports.filter(({ importer }) => importer === module.path)) {
      // Two modules importing the same name from the same place share it.
      const { specifier, imported } = binding;
      const owner = `${originKey({ kind: ORIGIN_KIND.EXTERNAL, specifier, imported })}:${binding.local}`;
      binding.local = claim(binding.local, owner, binding.rename);
    }
  }
  return finalNames;
};

export type JoinScopePayload = {
  /** Origin key → the name a non-exported declaration ended up with. */
  finalNames: Map<string, string>;
  /** The imports from outside the set, under their final local names, for the import block. */
  externalImports: ImportBinding[];
};

export type JoinScopeArgs = {
  /** In emission order: an earlier module keeps a contested name. */
  contexts: ReadonlyArray<ModuleContext>;
  resolver: OriginResolver;
};

/** Renames bindings across the modules' source files so they share one scope. */
export const joinScope = ({ contexts, resolver }: JoinScopeArgs): JoinScopePayload => {
  const { collapses, externalImports } = splitImports(contexts, resolver);
  const finalNames = assignNames(contexts, externalImports);
  for (const { binding, origin } of collapses) {
    const name = finalNames.get(originKey(origin)) ?? origin.name;
    if (binding.local !== name) {
      binding.rename(name);
    }
  }
  return { finalNames, externalImports };
};
