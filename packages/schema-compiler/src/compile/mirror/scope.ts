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

// Splits every import of every module into `collapsedImports`, which point
// at a declaration in the scanned set and become plain references to it,
// and `externalImports`, which stay imports in the Destination File's
// import block.
//
//   import { user } from './user.js';       // collapsed: user.ts declares `user`
//   import { pvl } from '@pvl/schema';      // external
//   import { pvl } from './reexports.js';   // external, when reexports.ts is
//                                           // `export { pvl } from '@pvl/schema'`:
//                                           // becomes `import { pvl } from '@pvl/schema'`
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

// Claims a top-level name for the binding `ownerKey` and returns the name
// it gets: `name` when no other binding has it yet, otherwise the first
// free `<name>_<n>`, counting from 2. Records the claim in `ownerKeyByName`.
//
//   claimUniqueName(owners, 'user', 'local:a.ts:user')  // 'user'
//   claimUniqueName(owners, 'user', 'local:a.ts:user')  // 'user': same binding
//   claimUniqueName(owners, 'user', 'local:b.ts:user')  // 'user_2'
//   claimUniqueName(owners, 'user', 'local:c.ts:user')  // 'user_3'
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

// The owner key of an import from outside the set: the same for every
// module importing the same export under the same local name, so they
// share one import and one name in the Destination File.
//
//   import { pvl } from '@pvl/schema';  // in user.ts and post.ts: one owner
//   import { pvl as p } from '@pvl/schema';  // a different owner: name `p`
const toExternalImportOwnerKey = ({
  rewrittenSpecifier,
  importedName,
  localName,
}: ImportBinding): string => {
  return `${toOriginKey({ kind: ORIGIN_KIND.EXTERNAL, rewrittenSpecifier, importedName })}:${localName}`;
};

// Gives every top-level binding of every module a name no other binding
// in the Destination File has, renaming it and its references in its
// module where needed. Exported declarations are claimed first and keep
// their names, since renaming them would change the Destination File's
// exports; then, module by module in emission order, each other
// declaration and each external import claims its name.
//
//   // emitted first: user.ts          // emitted second: post.ts
//   const format = …;                  const format = …;      // → format_2
//   export const user = …;             const user = …;        // → user_2: exported in user.ts
//   import { pvl } from '@pvl/schema'; import { pvl } from '@pvl/schema';  // shared
//
// Returns each non-exported declaration's final name by origin key, and
// updates each external import's `localName` in place.
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

/**
 * Renames the bindings across the scanned modules' source files so they can
 * share the Destination File's single top-level scope: no two bindings
 * share a name, and every import into the scanned set is renamed to the
 * final name of the declaration it points at, so the import can be removed
 * and its references keep working.
 *
 * ```ts
 * // user.ts: const format = …; export const user = …;
 * // post.ts: import { user as author } from './user.js'; const format = …;
 * //          export const post = pvl.object({ author, by: format });
 *
 * // In the Destination File:
 * const format = …; export const user = …;
 * const format_2 = …;
 * export const post = pvl.object({ author: user, by: format_2 });
 * ```
 *
 * Returns the final names of the renamed declarations, for the export
 * rewrites, and the imports from outside the set, for the import block.
 */
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
