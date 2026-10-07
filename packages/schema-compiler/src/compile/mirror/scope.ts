// The Destination File's one top-level scope. Exported names keep theirs;
// every other binding takes its name unless a different binding already
// has it, and is renamed to `<name>_<n>` otherwise.
import type { ImportBinding, ModuleContext } from './context.js';
import { ORIGIN_KIND, originKey } from './origins.js';

export type AssignNamesArgs = {
  /** In emission order: an earlier module keeps a contested name. */
  contexts: ReadonlyArray<ModuleContext>;
  /** The imports from outside the set, each renamed in place when it has to be. */
  externalImports: ReadonlyArray<ImportBinding>;
};

/**
 * Renames every clashing binding in its module, updating each external
 * import's `local` in place, and returns origin key → final name for each
 * non-exported declaration.
 */
export const assignNames = ({
  contexts,
  externalImports,
}: AssignNamesArgs): Map<string, string> => {
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
    for (const binding of externalImports.filter(
      (candidate) => candidate.importer === module.path,
    )) {
      // Two modules importing the same name from the same place share it.
      const owner = `${originKey({ kind: ORIGIN_KIND.EXTERNAL, specifier: binding.specifier, imported: binding.imported })}:${binding.local}`;
      binding.local = claim(binding.local, owner, binding.rename);
    }
  }
  return finalNames;
};
