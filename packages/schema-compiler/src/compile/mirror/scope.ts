// Joins the modules into the Destination File's one top-level scope. An
// import into the set collapses into a reference to the binding it names.
// Exported names keep theirs; every other binding takes its name unless a
// different binding already has it, and is renamed to `<name>_<n>` otherwise.
import {
  renameAvoidingShadowing,
  renameImportBinding,
  type ImportBinding,
  type ModuleContext,
} from './context.js';
import {
  ORIGIN_KIND,
  toOriginKey,
  findLocalNameOrigin,
  type LocalOrigin,
  type OriginLookup,
} from './origins.js';

// An import into the set that becomes a reference to `bindingOrigin`.
type CollapsedImport = {
  importBinding: ImportBinding;
  bindingOrigin: LocalOrigin;
};

type SeparateCollapsedAndExternalImportsPayload = {
  collapsedImports: CollapsedImport[];
  externalImports: ImportBinding[];
};

// Each import is from outside the set, or into it. One into the set
// resolves to a scanned module's declaration, or through it to an import
// from outside, which then stands in for it.
const separateCollapsedAndExternalImports = (
  moduleContexts: ReadonlyArray<ModuleContext>,
  originLookup: OriginLookup,
): SeparateCollapsedAndExternalImportsPayload => {
  const collapsedImports: CollapsedImport[] = [];
  const externalImports: ImportBinding[] = [];
  for (const moduleContext of moduleContexts) {
    for (const importBinding of moduleContext.importBindings) {
      const bindingOrigin =
        importBinding.scannedTargetPath === undefined
          ? undefined
          : findLocalNameOrigin(originLookup, moduleContext, importBinding.localName);
      if (bindingOrigin === undefined) {
        externalImports.push(importBinding);
      } else if (bindingOrigin.kind === ORIGIN_KIND.LOCAL) {
        collapsedImports.push({ importBinding, bindingOrigin });
      } else {
        const { rewrittenSpecifier, importedName } = bindingOrigin;
        externalImports.push({
          ...importBinding,
          rewrittenSpecifier,
          importedName,
          scannedTargetPath: undefined,
        });
      }
    }
  }
  return { collapsedImports, externalImports };
};

// The name `ownerKey` ends up with: `name` when it is free or already
// `ownerKey`'s, otherwise the first free `<name>_<n>`. Records the claim.
const claimUniqueName = (
  ownerKeyByName: Map<string, string>,
  name: string,
  ownerKey: string,
): string => {
  const currentOwner = ownerKeyByName.get(name);
  if (currentOwner === undefined || currentOwner === ownerKey) {
    ownerKeyByName.set(name, ownerKey);
    return name;
  }
  let suffix = 2;
  while (ownerKeyByName.has(`${name}_${String(suffix)}`)) {
    suffix += 1;
  }
  const suffixedName = `${name}_${String(suffix)}`;
  ownerKeyByName.set(suffixedName, ownerKey);
  return suffixedName;
};

// Two modules importing the same name from the same place share it.
const toExternalImportOwnerKey = ({
  rewrittenSpecifier,
  importedName,
  localName,
}: ImportBinding): string => {
  return `${toOriginKey({ kind: ORIGIN_KIND.EXTERNAL, rewrittenSpecifier, importedName })}:${localName}`;
};

// Renames every clashing binding in its module, updating each external
// import's `localName` in place, and returns origin key → final name for each
// non-exported declaration.
const assignUniqueTopLevelNames = (
  moduleContexts: ReadonlyArray<ModuleContext>,
  externalImports: ReadonlyArray<ImportBinding>,
): Map<string, string> => {
  const ownerKeyByName = new Map<string, string>();
  for (const { scannedModule, declaredNames } of moduleContexts) {
    for (const { declarationName } of declaredNames.filter(
      ({ isExportedUnderOwnName }) => isExportedUnderOwnName,
    )) {
      ownerKeyByName.set(
        declarationName,
        toOriginKey({ kind: ORIGIN_KIND.LOCAL, modulePath: scannedModule.path, declarationName }),
      );
    }
  }
  const finalNameByOriginKey = new Map<string, string>();
  for (const { scannedModule, declaredNames } of moduleContexts) {
    for (const { declarationName, nameIdentifier } of declaredNames.filter(
      ({ isExportedUnderOwnName }) => !isExportedUnderOwnName,
    )) {
      const ownerKey = toOriginKey({
        kind: ORIGIN_KIND.LOCAL,
        modulePath: scannedModule.path,
        declarationName,
      });
      const uniqueName = claimUniqueName(ownerKeyByName, declarationName, ownerKey);
      if (uniqueName !== declarationName) {
        renameAvoidingShadowing(nameIdentifier, uniqueName);
      }
      finalNameByOriginKey.set(ownerKey, uniqueName);
    }
    for (const importBinding of externalImports.filter(
      ({ importerPath }) => importerPath === scannedModule.path,
    )) {
      const uniqueName = claimUniqueName(
        ownerKeyByName,
        importBinding.localName,
        toExternalImportOwnerKey(importBinding),
      );
      if (uniqueName !== importBinding.localName) {
        renameImportBinding(importBinding, uniqueName);
        importBinding.localName = uniqueName;
      }
    }
  }
  return finalNameByOriginKey;
};

export type JoinIntoOneTopLevelScopePayload = {
  /** Origin key → the name a non-exported declaration ended up with. */
  finalNameByOriginKey: Map<string, string>;
  /** The imports from outside the set, under their final local names, for the import block. */
  externalImports: ImportBinding[];
};

export type JoinIntoOneTopLevelScopeArgs = {
  /** In emission order: an earlier module keeps a contested name. */
  moduleContexts: ReadonlyArray<ModuleContext>;
  originLookup: OriginLookup;
};

/** Renames bindings across the modules' source files so they share one scope. */
export const joinIntoOneTopLevelScope = ({
  moduleContexts,
  originLookup,
}: JoinIntoOneTopLevelScopeArgs): JoinIntoOneTopLevelScopePayload => {
  const { collapsedImports, externalImports } = separateCollapsedAndExternalImports(
    moduleContexts,
    originLookup,
  );
  const finalNameByOriginKey = assignUniqueTopLevelNames(moduleContexts, externalImports);
  for (const { importBinding, bindingOrigin } of collapsedImports) {
    const finalName =
      finalNameByOriginKey.get(toOriginKey(bindingOrigin)) ?? bindingOrigin.declarationName;
    if (importBinding.localName !== finalName) {
      renameImportBinding(importBinding, finalName);
    }
  }
  return { finalNameByOriginKey, externalImports };
};
